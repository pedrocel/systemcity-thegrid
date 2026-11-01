# SystemCity: o servidor (contas, encontros, The Grid, API) e o site estático no mesmo container.
FROM node:24-slim

WORKDIR /app
ENV NODE_ENV=production PORTA=3000 HTTPS=0 BANCO=/app/servidor/dados/encontros.db

COPY servidor/package.json servidor/package-lock.json ./servidor/
RUN cd servidor && npm ci --omit=dev && npm cache clean --force

COPY . .
RUN mkdir -p /app/servidor/dados && chown -R node:node /app/servidor/dados
USER node

EXPOSE 3000
VOLUME ["/app/servidor/dados"]
HEALTHCHECK --interval=30s --timeout=4s CMD node -e "fetch('http://127.0.0.1:3000/saude').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "servidor/index.mjs"]
