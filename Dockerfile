FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json .npmrc ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src src
RUN npm run build

EXPOSE 3000

ENTRYPOINT ["npm", "run", "start"]
