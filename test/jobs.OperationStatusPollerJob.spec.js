'use strict';

const config = require('../lib/config');
const CONST = require('../lib/constants');
const utils = require('../lib/utils');
const BaseJob = require('../lib/jobs/BaseJob');
const ScheduleManager = require('../lib/jobs/ScheduleManager');
const OperationStatusPollerJob = require('../lib/jobs/OperationStatusPollerJob');

describe('Jobs', function () {
  /* jshint expr:true */
  describe('OperationStatusPollerJob', function () {
    const backup_guid = '071acb05-66a3-471b-af3c-8bbf1e4180be';
    const deploymentName = CONST.FABRIK_INTERNAL_MONGO_DB.INSTANCE_ID;

    function getJobBasedOnOperation(operationName) {
      const job = {
        attrs: {
          name: `${deploymentName}_${operationName}_${backup_guid}_${CONST.JOB.OPERATION_STATUS_POLLER}`,
          data: {
            deployment_name: deploymentName,
            type: CONST.BACKUP.TYPE.ONLINE,
            trigger: CONST.BACKUP.TRIGGER.SCHEDULED,
            operation_job_started_at: new Date().toISOString(),
            operation: operationName,
            operation_response: {
              operation: operationName,
              backup_guid: backup_guid,
              token: getTokenBasedOnOperation(operationName)
            }
          },
          lastRunAt: new Date(),
          nextRunAt: new Date(),
          repeatInterval: '*/1 * * * *',
          lockedAt: null,
          repeatTimezone: 'America/New_York'
        },
        fail: () => undefined,
        save: () => undefined,
        touch: () => undefined
      };
      return job;
    }

    function getTokenBasedOnOperation(operationName) {
      return utils.encodeBase64({
        backup_guid: backup_guid,
        agent_ip: mocks.agent.ip,
        operation: operationName
      });
    }

    let baseJobLogRunHistoryStub, cancelScheduleStub;

    before(function () {
      mocks.reset();
      cancelScheduleStub = sinon.stub(ScheduleManager, 'cancelSchedule', () => Promise.resolve({}));
      baseJobLogRunHistoryStub = sinon.stub(BaseJob, 'logRunHistory');
      baseJobLogRunHistoryStub.withArgs().returns(Promise.resolve({}));
      return mocks.setup([]);
    });

    afterEach(function () {
      mocks.reset();
      cancelScheduleStub.reset();
      baseJobLogRunHistoryStub.reset();
    });

    after(function () {
      cancelScheduleStub.restore();
      baseJobLogRunHistoryStub.restore();
    });

    describe('#CheckBackupStatus', function () {

      it('backup status check should be succesful and status is succeeded', function (done) {
        mocks.serviceBrokerClient.getDeploymentBackupStatus(deploymentName, getTokenBasedOnOperation('backup'), 'succeeded');
        try {
          const job = getJobBasedOnOperation('backup');
          return OperationStatusPollerJob.run(job, () => {
            mocks.verify();
            expect(cancelScheduleStub).to.be.calledOnce;
            expect(cancelScheduleStub.firstCall.args[0]).to.eql(`${deploymentName}_backup_${backup_guid}`);
            expect(cancelScheduleStub.firstCall.args[1]).to.eql(CONST.JOB.OPERATION_STATUS_POLLER);
            expect(baseJobLogRunHistoryStub).to.be.calledOnce;
            expect(baseJobLogRunHistoryStub.firstCall.args[0]).to.eql(undefined);
            expect(baseJobLogRunHistoryStub.firstCall.args[1].state).to.eql('succeeded');
            expect(baseJobLogRunHistoryStub.firstCall.args[1].stage).to.eql('Creating volume');
            expect(baseJobLogRunHistoryStub.firstCall.args[2].attrs).to.eql(job.attrs);
            expect(baseJobLogRunHistoryStub.firstCall.args[3]).to.eql(undefined);
            done();
          });
        } catch (ex) {
          console.log('exception occurred');
          mocks.verify();
        }
      });

      it('backup status check should be succesful and status is processing', function (done) {
        mocks.serviceBrokerClient.getDeploymentBackupStatus(deploymentName, getTokenBasedOnOperation('backup'));

        const job = getJobBasedOnOperation('backup');
        return OperationStatusPollerJob.run(job, () => {
          mocks.verify();
          expect(cancelScheduleStub).not.to.be.called;
          expect(baseJobLogRunHistoryStub).to.be.calledOnce;
          expect(baseJobLogRunHistoryStub.firstCall.args[0]).to.eql(undefined);
          expect(baseJobLogRunHistoryStub.firstCall.args[1].state).to.eql('processing');
          expect(baseJobLogRunHistoryStub.firstCall.args[1].stage).to.eql('Creating volume');
          expect(baseJobLogRunHistoryStub.firstCall.args[2].attrs).to.eql(job.attrs);
          expect(baseJobLogRunHistoryStub.firstCall.args[3]).to.eql(undefined);
          done();
        });
      });


      it('backup status check should be succesful and status is processing for longer than timeout should cancel itself', function (done) {
        mocks.serviceBrokerClient.getDeploymentBackupStatus(deploymentName, getTokenBasedOnOperation('backup'), 'processing');

        const job = getJobBasedOnOperation('backup');
        const old_frequency = config.backup.backup_restore_status_poller_timeout;
        config.backup.backup_restore_status_poller_timeout = 0;
        return OperationStatusPollerJob.run(job, () => {
          mocks.verify();
          const expectedMsg = `Deployment ${deploymentName} backup with backup guid ${backup_guid} exceeding timeout time 
                      ${config.backup.backup_restore_status_poller_timeout / 1000 / 60} (mins). Stopping status check`;
          config.backup.backup_restore_status_poller_timeout = old_frequency;
          expect(cancelScheduleStub).to.be.calledOnce;
          expect(cancelScheduleStub.firstCall.args[0]).to.eql(`${deploymentName}_backup_${backup_guid}`);
          expect(cancelScheduleStub.firstCall.args[1]).to.eql(CONST.JOB.OPERATION_STATUS_POLLER);
          expect(baseJobLogRunHistoryStub).to.be.calledOnce;
          expect(baseJobLogRunHistoryStub.firstCall.args[0].statusCode).to.eql('ERR_BACKUP_TIME_OUT');
          expect(baseJobLogRunHistoryStub.firstCall.args[0].statusMessage).to.eql(expectedMsg);
          expect(baseJobLogRunHistoryStub.firstCall.args[1].state).to.eql('processing');
          expect(baseJobLogRunHistoryStub.firstCall.args[1].stage).to.eql('Creating volume');
          expect(baseJobLogRunHistoryStub.firstCall.args[2].attrs).to.eql(job.attrs);
          expect(baseJobLogRunHistoryStub.firstCall.args[3]).to.eql(undefined);
          done();
        });
      });

      it('backup status check should be succesful and status is succeeded (bootstrap bosh deployment)', function (done) {
        mocks.serviceBrokerClient.getDeploymentBackupStatus(deploymentName, getTokenBasedOnOperation('backup'),
          'succeeded', CONST.BOSH_DIRECTORS.BOOSTRAP_BOSH);

        let bootStrapBackupJob = getJobBasedOnOperation('backup');
        bootStrapBackupJob.attrs.data.bosh_director = CONST.BOSH_DIRECTORS.BOOSTRAP_BOSH;
        return OperationStatusPollerJob.run(bootStrapBackupJob, () => {
          mocks.verify();
          expect(cancelScheduleStub).to.be.calledOnce;
          expect(cancelScheduleStub.firstCall.args[0]).to.eql(`${deploymentName}_backup_${backup_guid}`);
          expect(cancelScheduleStub.firstCall.args[1]).to.eql(CONST.JOB.OPERATION_STATUS_POLLER);
          expect(baseJobLogRunHistoryStub).to.be.calledOnce;
          expect(baseJobLogRunHistoryStub.firstCall.args[0]).to.eql(undefined);
          expect(baseJobLogRunHistoryStub.firstCall.args[1].state).to.eql('succeeded');
          expect(baseJobLogRunHistoryStub.firstCall.args[1].stage).to.eql('Creating volume');
          expect(baseJobLogRunHistoryStub.firstCall.args[2].attrs).to.eql(bootStrapBackupJob.attrs);
          expect(baseJobLogRunHistoryStub.firstCall.args[3]).to.eql(undefined);
          done();
        });
      });

      it('should log error in case deployment_name,type, operation and operation_response.backup_guid are absent in Job data', function (done) {
        let sfClientStub;
        sfClientStub = sinon.stub(OperationStatusPollerJob, 'getBrokerClient');
        const job = getJobBasedOnOperation('backup');
        job.attrs.data = {};
        OperationStatusPollerJob.run(job, () => {
          const invalidInputMsg = `Operation status poller cannot be initiated as the required mandatory params 
      (deployment_name | type | operation | operation_response.backup_guid) is empty : ${JSON.stringify(job.attrs.data)}`;
          expect(sfClientStub).not.to.be.called;
          sfClientStub.restore();
          expect(baseJobLogRunHistoryStub.firstCall.args[0].message).to.eql(invalidInputMsg);
          expect(baseJobLogRunHistoryStub.firstCall.args[0].name).to.eql('BadRequest');
          expect(baseJobLogRunHistoryStub.firstCall.args[0].reason).to.eql('Bad Request');
          expect(baseJobLogRunHistoryStub.firstCall.args[0].status).to.eql(400);
          expect(baseJobLogRunHistoryStub.firstCall.args[1]).to.eql({});
          expect(baseJobLogRunHistoryStub.firstCall.args[2].attrs).to.eql(job.attrs);
          expect(baseJobLogRunHistoryStub.firstCall.args[3]).to.eql(undefined);
          done();
        });
      });

    });
  });
});