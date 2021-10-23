FROM alpine:3.14
RUN apk add --update nodejs npm
RUN addgroup -S node && adduser -S node -G node
USER node
WORKDIR /usr/src/app
COPY --chown=node:node package-lock.json package.json ./
RUN npm ci --only=production
COPY --chown=node:node *.js ./
COPY --chown=node:node mappings.json ./
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE ${PORT}
CMD ["npm", "start" ]
