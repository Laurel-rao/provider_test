FROM m.daocloud.io/docker.io/library/nginx:1.27-alpine

COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY ui/dist/ /usr/share/nginx/html/
