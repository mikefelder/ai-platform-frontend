# Stage 1: Build
FROM node:26-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --registry=https://packagefeedproxy.microsoft.io/npm/ --replace-registry-host=always --no-audit --no-fund
COPY . .
RUN npm run build

# Stage 2: Serve
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY docker/15-validate-secrets.sh /docker-entrypoint.d/15-validate-secrets.sh
RUN chmod 755 /docker-entrypoint.d/15-validate-secrets.sh
ENV NGINX_ENVSUBST_FILTER=^APIM_SUBSCRIPTION_KEY$
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
