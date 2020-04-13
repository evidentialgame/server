FROM node:12.16.2-alpine

COPY . .

RUN ["npm", "install"]

CMD ["node", "index.js"]
