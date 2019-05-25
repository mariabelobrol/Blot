var generateID = require("../../../app/models/blog/generateID");
var debug = require("debug")("blot:scripts:set-blog-id");
var async = require("async");
var updateBlog = require("./updateBlog");
var client = require("client");
var ensureOldBlogIsDisabled = require("./ensureOldBlogIsDisabled");
var get = require("../../get/blog");
var db = require("./db");

if (require.main === module) {
  console.log("Please pass the ID of an existing blog");

  loadID(process.argv[2], function(err, newBlogID) {
    if (err) throw err;
    main(process.argv[2], newBlogID, function(err) {
      if (err) throw err;
      console.log("Done!");
      process.exit();
    });
  });
}

function loadID(oldBlogID, callback) {
  client.get("switch-blog-id-format:" + oldBlogID, function(err, newBlogID) {
    if (err) return callback(err);
    newBlogID = newBlogID || generateID();

    client.set("switch-blog-id-format:" + oldBlogID, newBlogID, function(err) {
      if (err) return callback(err);
      callback(null, newBlogID);
    });
  });
}

function main(oldBlogID, newBlogID, callback) {
  if (!oldBlogID || !newBlogID) return callback(new Error("Pass oldBlogID"));

  var tasks = [
    require("./moveDirectories"),
    require("./switchDropboxClient"),
    require("./updateUser")
  ].map(function(task) {
    return task.bind(null, oldBlogID, newBlogID);
  });

  // We disable the old blog if it exists to ensure that no syncs can occur
  // while we change the blog's ID. This would be bad...
  ensureOldBlogIsDisabled(oldBlogID, newBlogID, function(err, renableNewBlog) {
    if (err) return callback(err);

    debug("Migrating", oldBlogID, "to", newBlogID);

    async.parallel(tasks, function(err) {
      if (err) return callback(err);

      db(oldBlogID, newBlogID, function(err) {
        if (err) return callback(err);

        updateBlog(oldBlogID, newBlogID, function(err) {
          if (err) return callback(err);

          renableNewBlog(function(err) {
            if (err) return callback(err);

            callback(null, newBlogID);
          });
        });
      });
    });
  });
}

module.exports = main;
