FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json .npmrc ./
RUN npm ci

COPY tsconfig.json .
COPY src src

EXPOSE 3000

ENTRYPOINT ["npm", "run", "start"]
