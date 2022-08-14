openssl ecparam -name secp384r1 -genkey -out keys/ec_key.pem

openssl req -new -x509 -key keys/ec_key.pem -sha256 -nodes -out keys/ec_crt.crt -days 365
