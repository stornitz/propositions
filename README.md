# Propositions

![screen](https://cloud.githubusercontent.com/assets/1359916/14562374/840e9076-031c-11e6-989f-a0befa2b7adf.png)

## Installation
```bash
$ git clone git@github.com:Stornitz/propositions.git
$ cp config.template.js config.js
```
Edit `config.js` with your favorite code editor.
## Requirements
* MySQL Server
* Node >= 4.2.1
* Google account(s)
* Google API. *[See below to create](#Create-A-Google-API)*

## Usage
0. Install
1. Start the server once, it will create tables in the database
2. Add entries in the **polls** tables
3. Restart the server
4. Go to *http://your_serveur:port*. Enjoy !

## Create a Google API
1. Go the [Google API Console][google-api-console]
2. Create a new project
3. Search **Google+ API** and enable it
4. Create credentials > **OAuth Client Id**
5. Select web application and fill the **Restrictions** form.

[google-api-console]: https://console.developers.google.com/project
