# 客户端设计指南

本文档规定 SMC-Web-Agent 客户端（`client/`）的构建方式。它是**约定性**文档：凡是代码库中已经一致的地方，这里把它固化；不一致的地方，这里选定约定，后续逐步收敛。有疑问时遵循本文档。

---

## 1. 理念与非目标

客户端刻意保持轻量。我们依赖框架和少量原语，而不是引入厚重的抽象层。

- **不引入全局状态库。** React Context 覆盖跨切面状态（鉴权、主题）。未经本文档记录的理由，不要添加 Redux/Zustand/Jotai。
- **默认不使用数据请求库。** 标准做法是薄封装 `fetchFromApi` 加上按功能划分的 `use*` hook。SWR 是受认可的例外出口，不是默认选择。
- **单一类型来源。** `src/lib/schema.ts` 镜像后端 API。类型手写，不做生成。
- **交互原语用 shadcn/ui + Radix。** 组合可访问的原语，而不是手搓控件。

目标是让新贡献者（或 agent）能预测代码库：给定一个功能，你应当已经知道文件放哪、数据怎么取、样式怎么写。

---

## 2. 技术栈

| 关注点 | 选择 |
| --- | --- |
| 框架 | Next.js 15，**App Router** |
| 语言 | TypeScript 5，`strict: true` |
| 样式 | Tailwind CSS v4（CSS-first，`@tailwindcss/postcss`），OKLch token |
| 组件 | shadcn/ui（New York、slate、CSS 变量）基于 Radix UI |
| 变体 | `class-variance-authority`（CVA） |
| 类名合并 | `cn()` = `clsx` + `tailwind-merge` |
| 图标 | `lucide-react` |
| 表单 | `react-hook-form` + `zod`（`zodResolver`） |
| 提示 | `sonner` |

路径别名：`@/*` → `src/*`。shadcn 别名见 `components.json`。

---

## 3. 目录结构

```
src/
├── app/                    # App Router，按布局而非按功能分路由组：
│   ├── (main)/             #   带 AppSidebar 的应用外壳
│   │   ├── login/          #   公开：登录
│   │   └── (protected)/    #   <RequireAuth> 门禁之下
│   │       ├── page.tsx           仪表盘
│   │       ├── members/           人员管理
│   │       ├── seminars/          组会管理
│   │       ├── weekly-reports/    周报统计
│   │       ├── notifications/     推送历史
│   │       └── settings/          设置
│   └── fonts/
├── components/
│   ├── ui/                 # 仅放 shadcn/ui 原语
│   ├── auth/               # RequireAuth
│   ├── sidebar/            # 应用外壳
│   ├── settings/           # 设置页分区
│   ├── members/            # 人员相关组件
│   ├── seminars/           # 组会相关组件
│   ├── weekly-reports/     # 周报相关组件
│   ├── sync/               # 飞书同步面板
│   ├── common/             # PageHeader / EmptyState / 消息预览等通用件
│   └── utils/              # 外壳辅助组件
├── lib/
│   ├── api.ts              #   唯一的网络出口
│   ├── auth.tsx            #   AuthProvider + useAuth
│   ├── schema.ts           #   全部共享类型
│   ├── utils.ts            #   cn()、格式化、颜色哈希
│   └── providers.tsx       #   主题 provider
└── hooks/                  # 共享领域/数据 hook
```

**新文件放哪？**

- shadcn 原语 → `components/ui/`。
- 可复用的数据/领域 hook → `src/hooks/`。
- 只服务单个路由的功能组件 → `components/<feature>/`。
- 共享类型 → `src/lib/schema.ts`。

---

## 4. 组件

**文件与命名约定**（是规则，不是建议）：

- 功能组件文件用 **PascalCase**：`MemberTable.tsx`。`ui/` 下的原语用 kebab-case：`button.tsx`。
- Props 接口命名为 `<Component>Props`。
- 功能组件**默认导出**；原语、hook、工具函数用**具名导出**。
- 所有交互组件以 `"use client"` 开头。页面与布局保持 Server Component，除非需要客户端能力。使用 `useSearchParams()` 时用 `<Suspense>` 包裹。

**变体用 CVA。** 有视觉变体的组件遵循 `button.tsx` 模式：`cva()` 定义、`data-slot` 属性、`cn(variants({ ... className }))`。能用 CVA 就不要用临时三元表达式。

**组合。** 优先使用 Radix 的 `asChild`（Slot）和复合组件，而不是堆砌 props。

**体积。** 超过约 300 行的组件是坏味道。把展示区块拆成独立组件，把派生/数据逻辑提到 helper 或 hook。

---

## 5. Hooks

**位置规则。** 共享领域/数据 hook 放在 `src/hooks/`，camelCase 命名 `useThing.ts`，返回标准结构。只服务单个组件的 hook 与其组件同目录。

标准数据 hook 结构：

```ts
export function useMembers(query: MemberQuery = {}) {
  const [members, setMembers] = useState<Member[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true); setError(null)
    try {
      setMembers((await getMembers(query)).members ?? [])
    } catch (err) {
      setError(err instanceof Error ? err : new Error("获取人员列表失败"))
    } finally {
      setIsLoading(false)
    }
  }, [/* 依赖 */])

  useEffect(() => { refetch() }, [refetch])
  return { members, isLoading, error, refetch }
}
```

每个数据 hook 都返回 `{ <数据>, isLoading, error, refetch }`，名称保持一致，消费方可以互换。

---

## 6. 数据请求

**所有网络访问都经过 `src/lib/api.ts`。** 组件里绝不直接调用 `fetch`。

- 鉴权基于 cookie：封装里设置了 `credentials: 'include'`，不要手动传 token。
- 除非 body 是 `FormData`，否则自动带上 `Content-Type: application/json`。
- **API 错误契约：** 后端把错误放在 `message`、`error` 或 `detail` 之一，封装统一归一化后抛出 `Error`。
- `204` 解析为 `null`，需处理空返回。

**变更与乐观更新。** 通过 `fetchFromApi(..., { method })` 提交，然后 `refetch()` 或做乐观补丁再对账。

**缓存决策。** 默认是挂载即请求；我们接受由此产生的重复请求，换取简单。只有当同一资源被 3 处以上不相关位置请求、或重复请求瀑布已影响体验时，才提升为 Context；仍不够再对该资源引入 SWR，并在本文档登记。

---

## 7. 类型

- **所有共享类型都在 `src/lib/schema.ts`**，镜像后端响应结构，不要在组件内重复声明。
- **不使用 TS `enum`。** 用 `as const` 数组加同名 union 类型（例如 `JOB_STATUSES` 与 `JobStatus`），既有字符串字面量的人机工程，又避开 enum 的运行时坑。
- 小型封闭集合且无运行时用途时，直接用字符串字面量 union。

---

## 8. 样式与主题

- **用 `cn()` 组合类名**，不要手工拼接字符串。
- **颜色一律来自 token，不写死 hex。** 主题色是 `src/app/globals.css` 里的 OKLch 变量，使用 Tailwind token 类（`bg-primary`、`text-muted-foreground`），暗色模式自动生效。
- **暗色模式**是 `<html>` 上的 `.dark` 类，持久化在 `localStorage.darkMode`，由预注水脚本应用以避免闪烁，通过 `useIsDarkMode` 切换。
- **圆角**来自 `--radius` token。
- 由内容派生的确定性颜色（头像等）走 `lib/utils.ts` 里的 helper。

---

## 9. 品牌

视觉识别是**蓝色为强调、slate 为中性底**。

- **品牌色：Tailwind `blue-500`**（hover/active 用 `blue-600`，暗色用 `blue-400`）。
  - 浅色面：`bg-blue-50` / `bg-blue-100`，文字 `text-blue-600` / `text-blue-700`。
  - 暗色面：`bg-blue-900` / `bg-blue-950`，文字 `text-blue-400` / `text-blue-300`。
- **中性底是 slate**，通过 §8 的 token 表达（`background`、`foreground`、`muted`、`border`）。蓝色是叠加在中性底上的强调，不是背景。
- **字体：Geist**（`--font-geist-sans` / `--font-geist-mono`），不要引入新字体族。
- **Logo：** 侧栏使用 `FlaskConical` 图标 + 文字 `SMC-Web-Agent`。

**语义色**是保留的，不做装饰用途：

| 含义 | 色阶 | 典型用途 |
| --- | --- | --- |
| 品牌/主色 | `blue` | 链接、品牌强调、主操作 |
| 危险/错误 | `red` / `--destructive` | 删除、错误提示 |
| 成功 | `green` | 成功状态、确认 |
| 警告 | `yellow` | 提醒、软警告 |

品牌/语义色都要给出暗色对应（`text-blue-600 dark:text-blue-400`），只有浅色的蓝色是 bug。

---

## 10. 视觉语言

**字体。** 使用以下字号刻度，不要引入新尺寸：

| 角色 | 类名 |
| --- | --- |
| 页面标题 | `text-2xl` / `text-3xl` + `font-bold` |
| 区块标题 | `text-lg` + `font-semibold`/`font-medium` |
| 正文（默认） | `text-sm` |
| 次要/元信息/说明 | `text-xs text-muted-foreground` |

正文是 `text-sm` 而非 `text-base`——这是信息密集的界面。

**图标。** `lucide-react`，用 Tailwind 类指定尺寸（`h-4 w-4`），不用 `size` prop。
- `h-4 w-4`（16px）——默认，与 `text-sm` 同行。
- `h-3 w-3` / `h-3.5 w-3.5`（12–14px）——密集场景。
- `h-5 w-5` 及以上——强调/独立使用。

图标加文字时，依赖父级 flex 的 `gap-2`。纯图标按钮要给 `aria-label`。

**动效与过渡。** 默认 `transition-colors` 或 `transition-opacity`，避免 `transition-all`。时长 200–300ms（`duration-200`/`duration-300`）。统一 spinner 是 `Loader2` + `animate-spin`；骨架屏用 `animate-pulse`。不要与 `prefers-reduced-motion` 对抗。

**响应式与移动端。** 移动端断点是 **768px**，通过 `useIsMobile()` 判断。两种适配方式，优先顺序：
1. **Tailwind 响应式前缀**（`md:flex`、`hidden md:block`）——默认选择。
2. **`useIsMobile()` 分支**——仅当布局**结构**不同（不同组件或交互模型）时使用，典型是移动端 `Sheet` / 桌面端 `Popover`。

---

## 11. 路由与鉴权

- **路由组按布局组织**：`(main)` = 应用外壳，`(protected)` = 需要登录。
- **鉴权状态**来自 `useAuth()`（`lib/auth.tsx` 的 `AuthProvider`）：`/api/auth/local/login` 设置 cookie，`/api/auth/me` 校验会话。

**门禁放在 `(protected)` 路由组。** 鉴权只在布局层做一次，不在每个页面重复实现。`components/auth/RequireAuth.tsx` 在鉴权解析时显示 spinner；未登录则 `router.replace` 到 `/login?returnTo=<path>`；否则渲染子节点。路由组不影响 URL，`/members` 仍是 `/members`。

**新增页面：** 需要登录就放进 `(protected)/`，公开就放在组根。不要在页面里写 `useAuth()` 重定向逻辑。

---

## 12. 交互约定

- **反馈用 toast。** 使用 `sonner`：每个用户发起的变更结束后 `toast.success(...)` / `toast.error(...)`。技术细节用 `console.error` 记录，给用户友好文案。
- **异步状态处理全部三种**，由 hook 的 `{ isLoading, error, <数据> }` 驱动：
  - *加载* → 内容形状的 `Skeleton`，或动作级的 `Loader2` + `animate-spin`。不要渲染半成品数据。
  - *空* → 明确的空状态（简短文案 + 主操作），绝不留白。
  - *错误* → 瞬时/动作失败用 `toast.error`；页面加载失败用内联提示。绝不静默失败。
- **表单**用 `react-hook-form` + `zod`，走 `Form` / `FormField` / `FormControl` / `FormMessage` 复合组件。提交处理器是 async，字段错误走 `FormMessage`，请求错误走 toast。
- **破坏性操作**必须经过 `AlertDialog` 确认，不能是裸按钮。
- **可访问性**来自 Radix 原语，优先使用它们而不是手搓菜单/对话框。

---

## 13. 待收敛的开放约定

新的分歧出现时在此登记，并在改到相关文件时顺手收敛，不要做大爆炸式重构。
