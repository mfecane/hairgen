FROM node:24-alpine3.21

WORKDIR /app

COPY package*.json ./

RUN if [ -f package-lock.json ]; then npm ci; else npm i; fi

CMD ["npm", "run", "dev"]
