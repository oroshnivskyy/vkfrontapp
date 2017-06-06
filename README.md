#Receiving messages from frontapp:
To receive messages you should setup inbox and channel, in config.json, add app.
In frontapp channel you should add callback url:
```
http://host_or_ip/appName/message
```
Config sample:
```json
{
  "mongodb": {
    "url": "mongodb://127.0.0.1:27017/vkfront"
  },
  "rabbitmq": {
    "url": "amqp://frontapp:1111@localhost:5672/frontapp"
  },
  "server": {
    "port": 3000
  },
  "apps": [
    {
      "host": "http://127.0.0.1",
      "requestInterval": 10000,
      "name": "testApp",
      "vk": {
        "api_key": "Vk community API key, with messages access",
        "lang": "en"
      },
      "frontapp": {
        "inbox": "frontapp inbox_id",
        "channel": "frontapp channel id",
        "token": "frontapp API token"
      }
    }
  ]
}
```