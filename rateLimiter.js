const rollingWindowLengthInSeconds = 60;

/**
 * This is a rate limiter function that works within the precision of microsecond
 * @param {object} redisClient A redis client object against which the rate limiter runs
 * @param {string} apiPath The API for which we are getting the rate limit
 * @param {number} maxAPILimit The max number of times this API can be called within a minute.
 * @param {function} callback The callback function this function would call after its computation
 * @returns {boolean} Returns true if the API is withing the rate limit, false otherwise
 *
 * This function has the following algorithm
 * Step 1: Each API gets its own sorted set in redis
 * Step 2: Remove all the elements from the set which are older than a minute
 * Step 3: Add the new timestamp to this group
 * Step 4: Add TTL to the whole set determined by rollingWindowLengthInSeconds
 * Step 5: Run all the above code in a redis transaction and returns true if the count in this set
 * is less than API Limit, false otherwise.
 *
 * Step 2 to Step 4 are performed as a transaction because this allows it work
 * in a distributed enviornment. We are using sorted set so that all the APIs
 * hitting our redis server can work across the distributed network and we remove
 * only the APIs timestamp that have expired.
 *
 * Dependency injection of redisClient allows easy testing of the code
 ***** */
const rateLimiterWithRollingWindow = (
  redisClient,
  apiPath,
  maxAPILimit,
  callback,
) => {
  const currentTimeInMilleseconds = new Date().getTime();
  const expiredTimestamp = currentTimeInMilleseconds - rollingWindowLengthInSeconds * 100;

  const transaction = redisClient.multi();
  transaction.zremrangebyscore(apiPath, 0, expiredTimestamp);
  transaction.zadd(apiPath, currentTimeInMilleseconds, currentTimeInMilleseconds);
  // TTL of 60 seconds. This will save space for inactive APIs as they will be removed from redis
  transaction.expire(apiPath, rollingWindowLengthInSeconds);
  transaction.zrange(apiPath, 0, -1, 'withscore');
  transaction.exec((err, results) => {
    if (err) callback(err);
    // redis exec command returns array with each index representing the output of each command
    // within the transaction. Hence the hardcoded 3
    // If you change the order of the commands, make sure you change this value here as well.
    if (results[3].length > maxAPILimit) {
      callback(null, false);
    } else {
      callback(null, true);
    }
  });
};

module.exports = rateLimiterWithRollingWindow;
