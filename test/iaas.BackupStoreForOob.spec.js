'use strict';

const lib = require('../lib');
const CONST = require('../lib/constants');
const CloudProviderClient = lib.iaas.CloudProviderClient;
const backupStoreForOob = lib.iaas.backupStoreForOob;

describe('iaas', function () {
  describe('backupStoreForOob', function () {
    const deployment_name = 'ccdb-postgresql';
    describe('getFileNamePrefix', function () {

      it('should return the correct file name prefix', function () {
        const options = {
          root_folder: CONST.FABRIK_OUT_OF_BAND_DEPLOYMENTS.ROOT_FOLDER_NAME,
          deployment_name: deployment_name
        };
        const prefix = backupStoreForOob.getFileNamePrefix(options);
        expect(prefix).to.equal(`${CONST.FABRIK_OUT_OF_BAND_DEPLOYMENTS.ROOT_FOLDER_NAME}/backup/${deployment_name}`);
      });

    });

    describe('findBackupFilename', function () {
      const backup_guid = 'some-guid';
      const started_at = new Date().toISOString();
      const backup_guid2 = 'some-guid2';
      const started_at2 = new Date().toISOString(); //latest date
      let sandbox, listStub;
      before(function () {
        sandbox = sinon.sandbox.create();
        listStub = sandbox.stub(CloudProviderClient.prototype, 'list');
        listStub.returns(Promise.resolve([{
          name: `${CONST.FABRIK_OUT_OF_BAND_DEPLOYMENTS.ROOT_FOLDER_NAME}/backup/${deployment_name}.${backup_guid}.${started_at}`
        }, {
          name: `${CONST.FABRIK_OUT_OF_BAND_DEPLOYMENTS.ROOT_FOLDER_NAME}/backup/${deployment_name}.${backup_guid2}.${started_at2}`
        }]));
      });
      afterEach(function () {
        listStub.reset();
      });
      after(function () {
        sandbox.restore();
      });

      it('should return the latest backupfile name', function () {
        const options = {
          root_folder: CONST.FABRIK_OUT_OF_BAND_DEPLOYMENTS.ROOT_FOLDER_NAME,
          deployment_name: deployment_name
        };
        return backupStoreForOob.findBackupFilename(options)
          .then(filename => {
            expect(filename.deployment_name).to.equal(deployment_name);
            expect(filename.backup_guid).to.equal(backup_guid2);
            expect(filename.root_folder).to.equal(CONST.FABRIK_OUT_OF_BAND_DEPLOYMENTS.ROOT_FOLDER_NAME);
          });

      });

      it('should return the correct backupfile name', function () {
        listStub.returns(Promise.resolve([{
          name: `${CONST.FABRIK_OUT_OF_BAND_DEPLOYMENTS.ROOT_FOLDER_NAME}/backup/${deployment_name}.${backup_guid}.${started_at}`
        }]));
        const options = {
          root_folder: CONST.FABRIK_OUT_OF_BAND_DEPLOYMENTS.ROOT_FOLDER_NAME,
          deployment_name: deployment_name,
          backup_guid: backup_guid
        };
        return backupStoreForOob.findBackupFilename(options)
          .then(filename => {
            expect(filename.deployment_name).to.equal(deployment_name);
            expect(filename.backup_guid).to.equal(backup_guid);
            expect(filename.root_folder).to.equal(CONST.FABRIK_OUT_OF_BAND_DEPLOYMENTS.ROOT_FOLDER_NAME);
          });

      });

    });
  });
});