process.env.UV_THREADPOOL_SIZE = 128
require("coffee-script/register")
require && require.extensions && delete require.extensions[".litcoffee"]
require && require.extensions && delete require.extensions[".coffee.md"]

cypress = require("./lib/cypress")

module.exports = {
  start () {
    cypress.start(process.argv)
  }
}
