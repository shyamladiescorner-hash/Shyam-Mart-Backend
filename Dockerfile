FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY db ./db
COPY scripts ./scripts
COPY .env.example ./
EXPOSE 4000
USER node
CMD ["node","src/server.js"]
