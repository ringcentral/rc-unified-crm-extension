jest.mock('axios', () => ({
  get: jest.fn(),
}));

jest.mock('../../lib/logger', () => ({
  error: jest.fn(),
}));

const axios = require('axios');
const logger = require('../../lib/logger');
const {
  getPublicConnectorList,
  getConnectorManifest,
} = require('../../connector/developerPortal');

describe('developerPortal connector', () => {
  beforeEach(() => {
    axios.get.mockReset();
    logger.error.mockReset();
  });

  test('loads the public connector list', async () => {
    axios.get.mockResolvedValueOnce({
      data: {
        connectors: [
          { id: 'public-a' },
          { id: 'public-b' },
        ],
      },
    });

    await expect(getPublicConnectorList()).resolves.toEqual({
      connectors: [
        { id: 'public-a' },
        { id: 'public-b' },
      ],
    });
    expect(axios.get).toHaveBeenCalledWith('https://appconnect.labs.ringcentral.com/public-api/connectors');
    expect(logger.error).not.toHaveBeenCalled();
  });

  test('returns null when public connector list loading fails', async () => {
    const error = new Error('network down');
    axios.get.mockRejectedValueOnce(error);

    await expect(getPublicConnectorList()).resolves.toBeNull();

    expect(logger.error).toHaveBeenCalledWith('Error getting public connector list:', error);
  });

  test('loads a public connector manifest by id', async () => {
    axios.get.mockResolvedValueOnce({
      data: {
        id: 'salesforce',
        name: 'Salesforce',
      },
    });

    await expect(getConnectorManifest({
      connectorId: 'salesforce',
    })).resolves.toEqual({
      id: 'salesforce',
      name: 'Salesforce',
    });
    expect(axios.get).toHaveBeenCalledWith('https://appconnect.labs.ringcentral.com/public-api/connectors/salesforce/manifest');
  });

  test('loads a private connector manifest for the requesting account', async () => {
    axios.get
      .mockResolvedValueOnce({
        data: {
          privateConnectors: [
            { id: 'private-crm' },
          ],
          sharedConnectors: [],
        },
      })
      .mockResolvedValueOnce({
        data: {
          id: 'private-crm',
          access: 'internal',
        },
      });

    await expect(getConnectorManifest({
      rcAccountId: 'rc-account-1',
      connectorId: 'private-crm',
      isPrivate: true,
    })).resolves.toEqual({
      id: 'private-crm',
      access: 'internal',
    });

    expect(axios.get).toHaveBeenNthCalledWith(
      1,
      'https://appconnect.labs.ringcentral.com/public-api/connectors/internal?accountId=rc-account-1',
    );
    expect(axios.get).toHaveBeenNthCalledWith(
      2,
      'https://appconnect.labs.ringcentral.com/public-api/connectors/private-crm/manifest?access=internal&type=connector&accountId=rc-account-1',
    );
  });

  test('loads a shared private connector manifest from the owner account', async () => {
    axios.get
      .mockResolvedValueOnce({
        data: {
          privateConnectors: [],
          sharedConnectors: [
            { id: 'shared-crm', accountId: 'owner-account' },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          id: 'shared-crm',
          ownerAccountId: 'owner-account',
        },
      });

    await expect(getConnectorManifest({
      rcAccountId: 'viewer-account',
      connectorId: 'shared-crm',
      isPrivate: true,
    })).resolves.toEqual({
      id: 'shared-crm',
      ownerAccountId: 'owner-account',
    });

    expect(axios.get).toHaveBeenNthCalledWith(
      2,
      'https://appconnect.labs.ringcentral.com/public-api/connectors/shared-crm/manifest?access=internal&type=connector&accountId=owner-account',
    );
  });

  test('returns null when a private connector is not visible to the account', async () => {
    axios.get.mockResolvedValueOnce({
      data: {
        privateConnectors: [],
        sharedConnectors: [],
      },
    });

    await expect(getConnectorManifest({
      rcAccountId: 'rc-account-2',
      connectorId: 'missing-crm',
      isPrivate: true,
    })).resolves.toBeNull();

    expect(logger.error.mock.calls[0][0]).toBe('Error getting connector manifest:');
    expect(logger.error.mock.calls[0][1].message).toBe('Connector not found');
  });

  test('returns null when public manifest loading fails', async () => {
    const error = new Error('manifest unavailable');
    axios.get.mockRejectedValueOnce(error);

    await expect(getConnectorManifest({
      connectorId: 'broken-crm',
    })).resolves.toBeNull();

    expect(logger.error).toHaveBeenCalledWith('Error getting connector manifest:', error);
  });
});

export {};
