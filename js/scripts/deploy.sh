echo 'deploy:start'

sshpass -p "U5bMaC&KrC" ssh root@87.106.198.232 << EOF
  rm -Rf /var/www/bleme/payment
  mkdir /var/www/bleme/payment
EOF
GLOBIGNORE='./scripts:./node_modules'
sshpass -p "U5bMaC&KrC" scp -r ./* root@87.106.198.232:/var/www/bleme/payment
sshpass -p "U5bMaC&KrC" ssh root@87.106.198.232 << EOF
  cd /var/www/bleme/payment
  npm i
  systemctl restart bleme.payment.service
EOF

echo 'deploy:done'