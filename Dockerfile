# Alongside on Railway: one Node service for the website, Breeze API, calendar feeds and reminders.
FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
COPY . .
# The deploy stops here if checks or tests fail.
RUN npm run check && npm test && npm run build
EXPOSE 8080
CMD ["node", "server/railway.mjs"]
