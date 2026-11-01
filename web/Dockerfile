# Dockerfile para cliente web / PWA y reverse proxy Nginx
FROM nginx:1.27-alpine

# Reemplazar configuración base de Nginx
COPY nginx.conf /etc/nginx/nginx.conf

# Copiar archivos estáticos de la PWA
COPY index.html manifest.webmanifest sw.js /usr/share/nginx/html/
COPY css/ /usr/share/nginx/html/css/
COPY js/ /usr/share/nginx/html/js/

# Ajustar permisos para usuario nginx
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chmod -R 755 /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1/healthz > /dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
