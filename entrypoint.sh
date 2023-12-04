# if CONFIG_BASE64 is present, decode it and write to config.json
if [ -n "$CONFIG_BASE64" ]; then
    echo "$CONFIG_BASE64" | base64 -d >config.json
fi

npm start
