# RuleShop storefront template — static SPA served by nginx.
#
# Build from the monorepo root:
#   docker build -f apps/storefront/Dockerfile -t ruleshop-storefront:latest .
#
# Run (runtime config — no rebuild per store):
#   docker run --rm -p 3000:80 \
#     -e RULESHOP_API_URL=https://control.example.com \
#     -e RULESHOP_API_KEY=rsk_… \
#     ruleshop-storefront:latest

FROM node:22-alpine AS build
WORKDIR /app

COPY apps/storefront/package.json ./
RUN npm install

COPY apps/storefront/ ./

# Placeholders only — real values come from /config.js at container start.
ENV VITE_RULESHOP_API_URL=http://placeholder.local
ENV VITE_RULESHOP_API_KEY=rsk_placeholder

RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY apps/storefront/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/storefront/docker/docker-entrypoint.sh /docker-entrypoint.sh
COPY --from=build /app/dist /usr/share/nginx/html

RUN chmod +x /docker-entrypoint.sh \
  && printf '%s\n' \
    'window.__RULESHOP_CONFIG__ = window.__RULESHOP_CONFIG__ || {};' \
    > /usr/share/nginx/html/config.js

EXPOSE 80
ENV RULESHOP_API_URL=""
ENV RULESHOP_API_KEY=""

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
