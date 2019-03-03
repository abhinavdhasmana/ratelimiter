/**
 * @jest-environment node
 */

const redis = require('redis-mock');
const sinon = require('sinon');

const client = redis.createClient();
const rateLimiter = require('../rateLimiter');

describe('rateLimiterWithRollingWindow', () => {
  beforeEach(() => {
    client.flushall();
    this.clock = sinon.useFakeTimers(new Date());
  });

  afterEach(() => {
    sinon.restore();
  });
  it('should return true if the API is called for the first time', (done) => {
    rateLimiter(client, 'APIOne', 10, (err, result) => {
      expect(result).toEqual(true);
      done();
    });
  });

  it('should return true if the API is called within the rate limit', (done) => {
    rateLimiter(client, 'APIOne', 5, () => {
      this.clock.tick(1);
      rateLimiter(client, 'APIOne', 5, () => {
        this.clock.tick(1);
        rateLimiter(client, 'APIOne', 5, (err, result) => {
          expect(result).toEqual(true);
          done();
        });
      });
    });
  });

  it('should return true if there is only one valid API call to be left', (done) => {
    rateLimiter(client, 'APIOne', 3, () => {
      this.clock.tick(1);
      rateLimiter(client, 'APIOne', 3, () => {
        this.clock.tick(1);
        rateLimiter(client, 'APIOne', 3, (err, result) => {
          expect(result).toEqual(true);
          done();
        });
      });
    });
  });

  it('should return true after the rolling window passes over the first call', (done) => {
    rateLimiter(client, 'APIOne', 2, () => {
      this.clock.tick(1);
      rateLimiter(client, 'APIOne', 2, () => {
        this.clock.tick(1);
        rateLimiter(client, 'APIOne', 2, () => {
          // This would result in false as API limit has exceeded
          this.clock.tick(6000); // 60 seconds
          rateLimiter(client, 'APIOne', 2, (err, result) => {
            expect(result).toEqual(true);
            done();
          });
        });
      });
    });
  });

  it('should delete the APIs key from redis after TTL', (done) => {
    rateLimiter(client, 'APIOne', 2, () => {
      this.clock.tick(60000);
      client.zcard('APIOne', (err, count) => {
        expect(count).toEqual(0);
        done();
      });
    });
  });

  it('should handle more than one API', (done) => {
    rateLimiter(client, 'APIOne', 1, () => {
      this.clock.tick(1);
      rateLimiter(client, 'APITwo', 2, () => {
        this.clock.tick(1);
        rateLimiter(client, 'APITwo', 2, (err, result) => {
          expect(result).toEqual(true);
          done();
        });
      });
    });
  });

  it('should return false if the API count exceeds the rate limit', (done) => {
    rateLimiter(client, 'APIOne', 2, () => {
      this.clock.tick(1);
      rateLimiter(client, 'APIOne', 2, () => {
        this.clock.tick(1);
        rateLimiter(client, 'APIOne', 2, (err, result) => {
          expect(result).toEqual(false);
          done();
        });
      });
    });
  });

  it('should return false if the API count exceeds the rate limit within the last millisecond', (done) => {
    rateLimiter(client, 'APIOne', 2, () => {
      this.clock.tick(1);
      rateLimiter(client, 'APIOne', 2, () => {
        this.clock.tick(5900);
        rateLimiter(client, 'APIOne', 2, (err, result) => {
          expect(result).toEqual(false);
          done();
        });
      });
    });
  });
});
