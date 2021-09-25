FROM node:12.18-alpine
RUN apk --no-cache --update upgrade
ENV NODE_ENV=production
ENV PORT=8080
WORKDIR /usr/src/app
COPY ["package.json", "package-lock.json*", "npm-shrinkwrap.json*", "./"]
RUN npm install --production --silent && npm audit fix && mv node_modules ../
COPY . .
EXPOSE ${PORT}
CMD ["npm", "start"]
