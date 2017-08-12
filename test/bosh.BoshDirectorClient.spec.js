'use strict';

const Promise = require('bluebird');
const uuid = require('uuid');
const _ = require('lodash');
const errors = require('../lib/errors');
const config = require('../lib/config');
const NotFound = errors.NotFound;
const BadRequest = errors.BadRequest;
const BoshDirectorClient = require('../lib/bosh/BoshDirectorClient');
const yaml = require('js-yaml');
const id = uuid.v4();
const deployment_name = id;
const taskId = Math.floor(Math.random() * 123456789);
const bosh_taskId = `bosh_${taskId}`;
const manifest = yaml.safeDump({
  name: id
});
const no_of_directors = 2;
let primary_config = _.sample(_
  .filter(config.directors, function (director) {
    return director.support_create && director.primary;
  }));

class MockBoshDirectorClient extends BoshDirectorClient {
  constructor(request, response) {
    super();
    this.req = request || {};
    this.res = _.defaults(response, {
      body: {},
      statusCode: -1,
      headers: {}
    });
  }

  makeRequest(options, expectedStatusCode) {
    switch (this.res.statusCode) {
    case 400:
      this.res.statusCode = 204;
      return Promise.reject(new BadRequest(''));
    case 404:
      this.res.statusCode = 204;
      return Promise.reject(new NotFound(''));
    default:
      expect(expectedStatusCode).to.equal(this.res.statusCode);
      expect(_.omit(options, 'body')).to.eql(_.omit(this.req, 'body'));

      return Promise.resolve({
        body: this.res.body,
        statusCode: this.res.statusCode,
        headers: this.res.headers
      });
    }
  }

  makeRequestWithConfig(options, expectedStatusCode) {
    switch (this.res.statusCode) {
    case 400:
      this.res.statusCode = 204;
      return Promise.reject(new BadRequest(''));
    case 404:
      this.res.statusCode = 204;
      return Promise.reject(new NotFound(''));
    default:
      expect(expectedStatusCode).to.equal(this.res.statusCode);
      expect(_.omit(options, 'body')).to.eql(_.omit(this.req, 'body'));

      return Promise.resolve({
        body: this.res.body,
        statusCode: this.res.statusCode,
        headers: this.res.headers
      });
    }
  }

  populateCache() {
    this.cache = {};
    this.cache[deployment_name] = primary_config;
  }

}

describe('bosh', () => {
  describe('BoshDirectorClient', () => {

    describe('#constructor', () => {
      it('initializes variables', () => {
        const dc = new MockBoshDirectorClient();
        expect(dc.cache).to.be.an('object');
      });
    });

    describe('#clearCache', () => {
      it('empties the cache', () => {
        const dc = new MockBoshDirectorClient();
        dc.clearCache();
        expect(dc.cache).to.eql({});
      });
    });

    describe('#getInfo', () => {
      it('returns a JSON object', (done) => {
        let request = {
          method: 'GET',
          url: '/info'
        };
        let response = {
          body: JSON.stringify({
            uuid: uuid.v4()
          }),
          statusCode: 200
        };

        new MockBoshDirectorClient(request, response).getInfo().then((content) => {
          expect(content).to.eql(JSON.parse(response.body));
          done();
        }).catch(done);
      });
    });

    describe('#getDeployments', () => {
      it('returns a JSON object', (done) => {
        let request = {
          method: 'GET',
          url: '/deployments'
        };
        let response = {
          body: JSON.stringify({
            uuid: uuid.v4()
          }),
          statusCode: 200
        };

        new MockBoshDirectorClient(request, response).getDeployments().then((content) => {
          expect(content).to.eql(_.range(no_of_directors).map(() => JSON.parse(response.body)));
          done();
        }).catch(done);
      });
    });

    describe('#getDeployment', () => {
      it('returns a JSON object', (done) => {
        let request = {
          method: 'GET',
          url: `/deployments/${id}`
        };
        let response = {
          body: JSON.stringify({
            uuid: uuid.v4()
          }),
          statusCode: 200
        };

        new MockBoshDirectorClient(request, response).getDeployment(id).then((content) => {
          expect(content).to.eql(JSON.parse(response.body));
          done();
        }).catch(done);
      });
    });

    describe('#getDeploymentManifest', () => {
      it('returns a YAML object', (done) => {
        let request = {
          method: 'GET',
          url: `/deployments/${id}`
        };
        let response = {
          body: JSON.stringify({
            manifest: id
          }),
          statusCode: 200
        };

        new MockBoshDirectorClient(request, response).getDeploymentManifest(id).then((content) => {
          expect(content).to.eql(id);
          done();
        }).catch(done);
      });
    });

    describe('#createOrUpdateDeployment', () => {
      it('returns an integer (task-id)', (done) => {
        let taskId = Math.floor(Math.random() * 123456789);
        let request = {
          method: 'POST',
          url: '/deployments',
          headers: {
            'Content-Type': 'text/yaml'
          },
          qs: undefined,
          body: manifest
        };
        let response = {
          body: JSON.stringify({
            uuid: uuid.v4()
          }),
          statusCode: 302,
          headers: {
            location: `https://192.168.50.4:25555/a/link/to/the/task/resource/${taskId}`
          }
        };

        new MockBoshDirectorClient(request, response)
          .createOrUpdateDeployment(manifest)
          .then((content) => {
            expect(content).to.eql(`${deployment_name}_${taskId}`);
            done();
          })
          .catch(done);
      });
    });

    describe('#deleteDeployment', () => {
      it('returns an integer (task-id)', (done) => {
        let taskId = Math.floor(Math.random() * 123456789);
        let request = {
          method: 'DELETE',
          url: `/deployments/${deployment_name}`
        };
        let response = {
          body: JSON.stringify({
            uuid: uuid.v4()
          }),
          statusCode: 302,
          headers: {
            location: `https://192.168.50.4:25555/a/link/to/the/task/resource/${taskId}`
          }
        };

        new MockBoshDirectorClient(request, response).deleteDeployment(id).then((content) => {
          expect(content).to.eql(`${deployment_name}_${taskId}`);
          done();
        }).catch(done);
      });
    });

    describe('#getDeploymentVms', () => {
      it('returns a JSON object', () => {
        const vm = {};
        const vms = [vm];
        let request = {
          method: 'GET',
          url: `/deployments/${id}/vms`
        };
        let response = {
          body: JSON.stringify(vms),
          statusCode: 200
        };

        return new MockBoshDirectorClient(request, response)
          .getDeploymentVms(id)
          .then(body => expect(body).to.eql(vms));
      });
    });

    describe('#getDeploymentProperties', () => {
      it('returns a JSON object', (done) => {
        let request = {
          method: 'GET',
          url: `/deployments/${id}/properties`
        };
        let response = {
          body: JSON.stringify({
            uuid: uuid.v4()
          }),
          statusCode: 200
        };

        new MockBoshDirectorClient(request, response).getDeploymentProperties(id).then((content) => {
          expect(content).to.eql(JSON.parse(response.body));
          done();
        }).catch(done);
      });
    });

    describe('#createDeploymentProperty', () => {
      it('returns correct status code', (done) => {
        let request = {
          method: 'POST',
          url: `/deployments/${id}/properties`,
          json: true,
          body: {}
        };
        let response = {
          body: JSON.stringify({
            uuid: uuid.v4()
          }),
          statusCode: 204
        };

        new MockBoshDirectorClient(request, response).createDeploymentProperty(id).then((content) => {
          expect(content.statusCode).to.eql(204);
          done();
        }).catch(done);
      });
    });

    describe('#updateDeploymentProperty', () => {
      it('returns correct status code', (done) => {
        let request = {
          method: 'PUT',
          url: `/deployments/${id}/properties/${id}`,
          json: true,
          body: {
            value: id
          }
        };
        let response = {
          body: JSON.stringify({
            uuid: uuid.v4()
          }),
          statusCode: 204
        };

        new MockBoshDirectorClient(request, response).updateDeploymentProperty(id, id, id).then((content) => {
          expect(content.statusCode).to.eql(204);
          done();
        }).catch(done);
      });
    });

    describe('#createOrUpdateDeploymentProperty', () => {
      it('returns correct status code', (done) => {
        let request = {
          method: 'PUT',
          url: `/deployments/${id}/properties/${id}`,
          json: true,
          body: {
            value: id
          }
        };
        let response = {
          body: JSON.stringify({
            uuid: uuid.v4()
          }),
          statusCode: 400
        };

        new MockBoshDirectorClient(request, response).createOrUpdateDeploymentProperty(id, id, id)
          .then(() => {
            done();
          })
          .catch((content) => {
            expect(content.statusCode).to.eql(204);
            done();
          });
      });
    });

    describe('#updateOrCreateDeploymentProperty', () => {
      it('returns correct status code', (done) => {
        let request = {
          method: 'POST',
          url: `/deployments/${id}/properties`,
          json: true,
          body: {
            name: id,
            value: id
          }
        };
        let response = {
          body: JSON.stringify({
            uuid: uuid.v4()
          }),
          statusCode: 404
        };

        new MockBoshDirectorClient(request, response).updateOrCreateDeploymentProperty(id, id, id)
          .then(() => {
            done();
          })
          .catch((content) => {
            expect(content.statusCode).to.eql(204);
            done();
          });
      });
    });

    describe('#getDeploymentProperty', () => {
      it('returns an integer (task-id)', (done) => {
        let request = {
          method: 'GET',
          url: `/deployments/${id}/properties/${id}`
        };
        let response = {
          body: JSON.stringify({
            value: id
          }),
          statusCode: 200
        };

        new MockBoshDirectorClient(request, response).getDeploymentProperty(id, id).then((content) => {
          expect(content).to.eql(id);
          done();
        }).catch(done);
      });
    });

    describe('#deleteDeploymentProperty', () => {
      it('returns correct status code', (done) => {
        let request = {
          method: 'DELETE',
          url: `/deployments/${id}/properties/${id}`
        };
        let response = {
          statusCode: 204
        };

        new MockBoshDirectorClient(request, response).deleteDeploymentProperty(id, id).then((content) => {
          expect(content.statusCode).to.eql(204);
          done();
        }).catch(done);
      });
    });

    describe('#getTasks', () => {
      it('returns a JSON object', (done) => {
        let request = {
          method: 'GET',
          url: '/tasks',
          qs: {
            deployment: deployment_name,
            limit: 1000
          }
        };
        let response = {
          body: JSON.stringify([{
            id: 1234,
            uuid: uuid.v4()
          }]),
          statusCode: 200
        };

        new MockBoshDirectorClient(request, response).getTasks({
          deployment: deployment_name
        }).then((content) => {
          let body = JSON.parse(response.body)[0];
          body.id = `${deployment_name}_${body.id}`;
          expect(content).to.eql(_.range(no_of_directors).map(() => body));
          done();
        }).catch(done);
      });
    });

    describe('#getTask', () => {
      it('returns a JSON object', (done) => {
        let request = {
          method: 'GET',
          url: `/tasks/${taskId}`
        };
        let response = {
          body: JSON.stringify({
            uuid: uuid.v4()
          }),
          statusCode: 200
        };

        new MockBoshDirectorClient(request, response).getTask(bosh_taskId).then((content) => {
          expect(content).to.eql(JSON.parse(response.body));
          done();
        }).catch(done);
      });
    });

    describe('#getTaskResult', () => {
      it('returns a JSON object', (done) => {
        let request = {
          method: 'GET',
          url: `/tasks/${taskId}/output`,
          qs: {
            type: 'result'
          }
        };
        const body = [{
          uuid: uuid.v4()
        }];
        let response = {
          body: `${_.map(body, JSON.stringify).join('\n')}\n`,
          statusCode: 200
        };

        new MockBoshDirectorClient(request, response).getTaskResult(bosh_taskId).then((content) => {
          expect(content).to.eql(body);
          done();
        }).catch(done);
      });
    });

    describe('#getTaskEvents', () => {
      it('returns a JSON object', (done) => {
        let id1 = uuid.v4();
        let id2 = uuid.v4();
        let request = {
          method: 'GET',
          url: `/tasks/${taskId}/output`,
          qs: {
            type: 'event'
          }
        };
        let response = {
          body: `{\"uuid\": \"${id1}\"}\n{\"uuid\": \"${id2}\"}\n{uuid: ${id2}}`,
          statusCode: 200
        };

        new MockBoshDirectorClient(request, response).getTaskEvents(bosh_taskId).then((content) => {
          expect(content).to.be.a('Array');
          expect(content).to.have.length(2);
          expect(content[0].uuid).to.eql(id1);
          expect(content[1].uuid).to.eql(id2);
          done();
        }).catch(done);
      });
    });

    describe('#parseTaskid', () => {
      it('gets the taskid from a prefixed taskid', () => {
        const dc = new MockBoshDirectorClient();
        expect(dc.parseTaskid('123-asd-123-1_123')[1]).to.be.eql('123-asd-123-1');
        expect(dc.parseTaskid('123-asd-123-1_456')[2]).to.be.eql('456');
      });
    });

    describe('#lastSegment', () => {
      it('returns a string', (done) => {
        let content = new MockBoshDirectorClient().lastSegment('https://user:pass@url.com:1000/this/is/a/long/path');
        expect(content).to.be.a('string');
        expect(content).to.equal('path');
        done();
      });
    });
  });
});