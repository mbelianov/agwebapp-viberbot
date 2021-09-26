FROM node:12.18-alpine
RUN apk --no-cache --update upgrade
ENV NODE_ENV=production
ENV PORT=8080
WORKDIR /usr/src/app
COPY ["package.json", "./"]
RUN npm install --production --silent && npm audit fix 
COPY ["*.js","mapping.json", "."]
EXPOSE ${PORT}
CMD ["npm", "start"]
