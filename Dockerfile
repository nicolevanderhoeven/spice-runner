# Use official Nginx image as base
FROM nginx:alpine

# Copy all game files to Nginx's default html directory
COPY index.html /usr/share/nginx/html/
COPY scripts/ /usr/share/nginx/html/scripts/
COPY img/ /usr/share/nginx/html/img/

# Expose port 80
EXPOSE 80

# Nginx runs by default, no need to specify CMD

