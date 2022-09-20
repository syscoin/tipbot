echo $CONFIG_BASE64 | jq '@base64d | fromjson' >config.json

npm start
