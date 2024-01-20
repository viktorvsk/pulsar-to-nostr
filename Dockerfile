FROM node:21.5.0-alpine3.19

WORKDIR /usr/src/app

RUN npm install

COPY . .

CMD node index.js
