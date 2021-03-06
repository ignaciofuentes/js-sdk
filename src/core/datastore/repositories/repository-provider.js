import { Promise } from 'es6-promise';
import keys from 'lodash/keys';

import { Client } from '../../client';
import { KinveyError } from '../../errors';
import { InmemoryOfflineRepository } from './offline-repositories';
import { NetworkRepository } from './network-repository';
import { StorageProvider } from './storage-provider';
import { ensureArray } from '../../utils';
import { PromiseQueueByKey } from '../utils';
import { MemoryKeyValuePersister } from '../persisters';
import { testSupportCollection } from './utils';

const inmemoryRepoBuilder = (queue) => {
  const persister = new MemoryKeyValuePersister();
  return new InmemoryOfflineRepository(persister, queue);
};

// all inmemory instances should share the queue
const queue = new PromiseQueueByKey();
let _chosenRepoPromise;

let _availableStorages = {
  [StorageProvider.Memory]: inmemoryRepoBuilder
};

function _getRepoType() {
  return Client.sharedInstance().storage;
}

function _testRepoSupport(repo) {
  return repo.create(testSupportCollection, { _id: '1' });
}

function _getRepoForStorageProvider(storageProvider) {
  const repoBuilder = _availableStorages[storageProvider];
  if (!repoBuilder) {
    const errMsg = `The requested storage provider "${storageProvider}" is not available in this environment`;
    throw new KinveyError(errMsg);
  }
  return repoBuilder(queue);
}

/**
 * Selects the first repo from the priority list,
 * which returns a resolved promise for the support test
 * @param {string[]} storagePrecedence An array of enum values, sorted by priority
 * @returns {Promise<OfflineRepository>}
 */
function _getFirstSupportedRepo(storagePrecedence) {
  return storagePrecedence.reduce((result, storageProvider) => {
    return result.catch(() => {
      const repo = _getRepoForStorageProvider(storageProvider);
      return _testRepoSupport(repo)
        .then(() => repo);
    });
  }, Promise.reject());
}

function _chooseOfflineRepo() {
  const storagePrecedence = ensureArray(_getRepoType());

  return _getFirstSupportedRepo(storagePrecedence)
    .catch(() => {
      const errMsg = 'None of the selected storage providers are supported in this environment.';
      return Promise.reject(new KinveyError(errMsg));
    });
}

function getOfflineRepository() {
  if (!_chosenRepoPromise) {
    _chosenRepoPromise = _chooseOfflineRepo();
  }
  return _chosenRepoPromise;
}

function getNetworkRepository() {
  return new NetworkRepository();
}

function setSupportedRepoBuilders(repos) {
  _availableStorages = repos;
}

function getSupportedStorages() {
  return keys(_availableStorages);
}

/**
 * @private
 */
export const repositoryProvider = {
  getNetworkRepository,
  getOfflineRepository,
  setSupportedRepoBuilders,
  getSupportedStorages
};
