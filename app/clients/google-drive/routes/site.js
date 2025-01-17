const _ = require("lodash");
const moment = require("moment");
const config = require("config");
const querystring = require("querystring");
const hash = require("helper/hash");
const sync = require("../sync");
const clfdate = require("helper/clfdate");
const database = require("../database");
const express = require("express");
const dashboard = new express.Router();

// This is only neccessary in a development environment
// when using the webhook forwarding server.
dashboard.get("/authenticate", function (req, res) {
  const url =
    config.protocol +
    config.host +
    "/settings/client/google-drive/authenticate?" +
    querystring.stringify(req.query);

  res.redirect(url);
});

dashboard
  .route("/webhook")
  .get(function (req, res) {
    res.send("Ok!");
  })
  .post(async function (req, res) {
    const prefix = () => clfdate() + " Google Drive:";

    console.log(prefix(), "Received webhook");

    if (req.headers["x-goog-channel-token"]) {
      const token = querystring.parse(req.headers["x-goog-channel-token"]);

      const signature = hash(
        token.blogID + req.headers["x-goog-channel-id"] + config.session.secret
      );

      if (token.signature !== signature) {
        return console.error(prefix(), "Webhook has bad signature");
      }

      const account = await database.getAccount(token.blogID);

      const channel = {
        kind: "api#channel",
        id: req.headers["x-goog-channel-id"],
        resourceId: req.headers["x-goog-resource-id"],
        resourceUri: req.headers["x-goog-resource-uri"],
        token: req.headers["x-goog-channel-token"],
        expiration: moment(req.headers["x-goog-channel-expiration"])
          .valueOf()
          .toString(),
      };

      // When for some reason we can't stop the old webhook
      // for this blog during an account disconnection we sometimes
      // recieve webhooks on stale channels. This can tank the setup
      // of the blog on Google Drive and happens in my dev env.
      // We can't call drive.stop on the stale channel since the
      // refresh_token likely changed, just let it expire instead.
      if (!_.isEqual(channel, account.channel)) {
        return console.error(
          prefix(),
          "Mismatch between recieved channel and stored account.channel"
        );
      }

      sync(token.blogID, { fromScratch: false }, function (err) {
        if (err) {
          console.error(prefix(), token.blogID, "Error:", err);
        } else {
          console.log(prefix(), "Completed sync without error", token.blogID);
        }
      });
    }

    res.send("OK");
  });

module.exports = dashboard;
