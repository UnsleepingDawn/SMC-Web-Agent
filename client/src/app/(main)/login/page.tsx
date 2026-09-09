"use client"

import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { fetchFromApi } from "@/lib/api";

function LoginContent() {
	const { user, loading, error: authError } = useAuth();
	const [error, setError] = useState<string | null>(null);
	const searchParams = useSearchParams();
	const rawReturnTo = searchParams.get('returnTo');
	const returnTo = rawReturnTo && rawReturnTo.startsWith('/') && !rawReturnTo.startsWith('//') ? rawReturnTo : '/';

	const redirectAfterLogin = () => {
		window.location.assign(returnTo);
	};

	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [isLocalLoginLoading, setIsLocalLoginLoading] = useState(false);

	// If user is already logged in, redirect to return path
	useEffect(() => {
		if (user && !loading) {
			void redirectAfterLogin();
		}
	}, [user, loading, returnTo]);

	const handleLocalLogin = async (event: React.FormEvent) => {
		event.preventDefault();
		setError(null);
		setIsLocalLoginLoading(true);
		try {
			const data = await fetchFromApi('/api/auth/local/login', {
				method: 'POST',
				body: JSON.stringify({ email, password }),
			});
			if (!data.success) {
				setError(data.message || '邮箱或密码错误。');
				return;
			}
			await redirectAfterLogin();
		} catch (error) {
			setError(error instanceof Error ? error.message : '邮箱或密码错误。');
		} finally {
			setIsLocalLoginLoading(false);
		}
	};

	if (loading) {
		return (
			<div className="h-full flex flex-col items-center justify-center py-8 space-y-6">
				<Loader2 className="h-12 w-12 animate-spin text-primary" />
			</div>
		);
	}

	return (
		<div className="flex items-center justify-center h-full p-4">
			<Card className="w-full max-w-md relative">
				<CardHeader className="text-center">
					<CardTitle className="text-2xl">登录 SMC-Web-Agent</CardTitle>
					<CardDescription>登录以管理实验室人员、组会与周报。</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="space-y-4">
						{(error || authError) && (
							<Alert variant="destructive">
								<AlertCircle className="h-4 w-4" />
								<AlertDescription>
									{error || authError}
								</AlertDescription>
							</Alert>
						)}

						<form onSubmit={handleLocalLogin} className="space-y-2">
							<Input
								type="email"
								placeholder="邮箱"
								value={email}
								onChange={(event) => setEmail(event.target.value)}
								disabled={isLocalLoginLoading}
								required
							/>
							<Input
								type="password"
								placeholder="密码"
								value={password}
								onChange={(event) => setPassword(event.target.value)}
								disabled={isLocalLoginLoading}
								required
							/>
							<Button type="submit" className="w-full" disabled={isLocalLoginLoading || !email || !password}>
								{isLocalLoginLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : '登录'}
							</Button>
						</form>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

export default function LoginPage() {
	return (
		<Suspense fallback={
			<div className="h-full flex items-center justify-center">
				<Loader2 className="h-12 w-12 animate-spin text-primary" />
			</div>
		}>
			<LoginContent />
		</Suspense>
	)
}
