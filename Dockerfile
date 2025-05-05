FROM node:18-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy application files
COPY . .

# Create directory for public files
RUN mkdir -p /app/public
COPY public/index.html /app/public/

# Expose the port the app runs on
EXPOSE 3000
ARG ENVIRONMENT=dev

# Command to run the application
CMD ["node", "app.js"]