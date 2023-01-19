const debug = (...args) => {
  if (process.env.NODE_ENV !== "development") {
    return;
  }
  console.debug(...args);
};

const Log = {
  debug,
};

module.exports = Log;
