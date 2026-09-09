FROM node:24-slim AS build

WORKDIR /app

ARG HTTP_PROXY=http://host.docker.internal:7890
ARG HTTPS_PROXY=http://host.docker.internal:7890
ARG NO_PROXY=localhost,127.0.0.1,host.docker.internal

COPY package.json yarn.lock ./
RUN yarn config set proxy "${HTTP_PROXY}" \
    && yarn config set https-proxy "${HTTPS_PROXY}" \
    && yarn install --frozen-lockfile

COPY . .

ARG NEXT_PUBLIC_API_URL=
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

RUN yarn build

FROM node:24-slim AS production

ARG HTTP_PROXY=http://host.docker.internal:7890
ARG HTTPS_PROXY=http://host.docker.internal:7890
ARG NO_PROXY=localhost,127.0.0.1,host.docker.internal
ARG NEXT_PUBLIC_API_URL=

ENV NODE_ENV=production
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

WORKDIR /app
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./
COPY --from=build /app/yarn.lock ./
RUN yarn config set proxy "${HTTP_PROXY}" \
    && yarn config set https-proxy "${HTTPS_PROXY}" \
    && yarn install --production --frozen-lockfile

EXPOSE 3000
CMD ["yarn", "start"]
