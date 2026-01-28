// Use in-memory SQLite for isolated model tests
jest.mock('../../models/sequelize', () => {
  const { Sequelize } = require('sequelize');
  return {
    sequelize: new Sequelize({
      dialect: 'sqlite',
      storage: ':memory:',
      logging: false,
    }),
  };
});

const ptpHandler = require('../../handlers/ptp');
const { CacheModel } = require('../../models/cacheModel');
const { sequelize } = require('../../models/sequelize');

describe('PTP Handler', () => {
  beforeAll(async () => {
    await CacheModel.sync({ force: true });
  });

  afterEach(async () => {
    await CacheModel.destroy({ where: {} });
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await sequelize.close();
  });

  describe('getPtpAsyncTasks', () => {
    test('should retrieve async task status by IDs from CacheModel', async () => {
      // Arrange
      await CacheModel.create({
        id: 'user-123-task-1',
        status: 'processing',
        userId: 'user-123',
        cacheKey: 'ptpTask-googleDrive'
      });
      await CacheModel.create({
        id: 'user-123-task-2',
        status: 'completed',
        userId: 'user-123',
        cacheKey: 'ptpTask-piiRedaction'
      });

      // Act
      const result = await ptpHandler.getPtpAsyncTasks({
        asyncTaskIds: ['user-123-task-1', 'user-123-task-2']
      });

      // Assert
      expect(result).toHaveLength(2);
      expect(result).toContainEqual({ cacheKey: 'ptpTask-googleDrive', status: 'processing' });
      expect(result).toContainEqual({ cacheKey: 'ptpTask-piiRedaction', status: 'completed' });
    });

    test('should return empty array when no matching tasks found', async () => {
      // Arrange - no tasks created

      // Act
      const result = await ptpHandler.getPtpAsyncTasks({
        asyncTaskIds: ['non-existent-task-1', 'non-existent-task-2']
      });

      // Assert
      expect(result).toEqual([]);
    });

    test('should filter and return only tasks with matching IDs', async () => {
      // Arrange
      await CacheModel.create({
        id: 'user-123-task-1',
        status: 'processing',
        userId: 'user-123',
        cacheKey: 'ptpTask-googleDrive'
      });
      await CacheModel.create({
        id: 'user-456-task-2',
        status: 'completed',
        userId: 'user-456',
        cacheKey: 'ptpTask-piiRedaction'
      });
      await CacheModel.create({
        id: 'user-789-task-3',
        status: 'failed',
        userId: 'user-789',
        cacheKey: 'ptpTask-other'
      });

      // Act - only request tasks for user-123 and user-789
      const result = await ptpHandler.getPtpAsyncTasks({
        asyncTaskIds: ['user-123-task-1', 'user-789-task-3']
      });

      // Assert
      expect(result).toHaveLength(2);
      expect(result).toContainEqual({ cacheKey: 'ptpTask-googleDrive', status: 'processing' });
      expect(result).toContainEqual({ cacheKey: 'ptpTask-other', status: 'failed' });
      expect(result).not.toContainEqual(expect.objectContaining({ cacheKey: 'ptpTask-piiRedaction' }));
    });

    test('should automatically remove completed tasks from cache after retrieval', async () => {
      // Arrange
      await CacheModel.create({
        id: 'user-123-completed-task',
        status: 'completed',
        userId: 'user-123',
        cacheKey: 'ptpTask-googleDrive'
      });

      // Act
      const result = await ptpHandler.getPtpAsyncTasks({
        asyncTaskIds: ['user-123-completed-task']
      });

      // Assert - result should contain the task
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ cacheKey: 'ptpTask-googleDrive', status: 'completed' });

      // Verify task was removed from cache
      const remainingTask = await CacheModel.findByPk('user-123-completed-task');
      expect(remainingTask).toBeNull();
    });

    test('should automatically remove failed tasks from cache after retrieval', async () => {
      // Arrange
      await CacheModel.create({
        id: 'user-123-failed-task',
        status: 'failed',
        userId: 'user-123',
        cacheKey: 'ptpTask-piiRedaction'
      });

      // Act
      const result = await ptpHandler.getPtpAsyncTasks({
        asyncTaskIds: ['user-123-failed-task']
      });

      // Assert - result should contain the task
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ cacheKey: 'ptpTask-piiRedaction', status: 'failed' });

      // Verify task was removed from cache
      const remainingTask = await CacheModel.findByPk('user-123-failed-task');
      expect(remainingTask).toBeNull();
    });

    test('should preserve pending tasks in cache after retrieval', async () => {
      // Arrange
      await CacheModel.create({
        id: 'user-123-pending-task',
        status: 'pending',
        userId: 'user-123',
        cacheKey: 'ptpTask-googleDrive'
      });

      // Act
      const result = await ptpHandler.getPtpAsyncTasks({
        asyncTaskIds: ['user-123-pending-task']
      });

      // Assert - result should contain the task
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ cacheKey: 'ptpTask-googleDrive', status: 'pending' });

      // Verify task was NOT removed from cache
      const remainingTask = await CacheModel.findByPk('user-123-pending-task');
      expect(remainingTask).not.toBeNull();
      expect(remainingTask.status).toBe('pending');
    });

    test('should preserve processing tasks in cache after retrieval', async () => {
      // Arrange
      await CacheModel.create({
        id: 'user-123-processing-task',
        status: 'processing',
        userId: 'user-123',
        cacheKey: 'ptpTask-piiRedaction'
      });

      // Act
      const result = await ptpHandler.getPtpAsyncTasks({
        asyncTaskIds: ['user-123-processing-task']
      });

      // Assert - result should contain the task
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ cacheKey: 'ptpTask-piiRedaction', status: 'processing' });

      // Verify task was NOT removed from cache
      const remainingTask = await CacheModel.findByPk('user-123-processing-task');
      expect(remainingTask).not.toBeNull();
      expect(remainingTask.status).toBe('processing');
    });

    test('should handle mixed task statuses - remove completed/failed but preserve pending/processing', async () => {
      // Arrange
      await CacheModel.create({
        id: 'task-completed',
        status: 'completed',
        userId: 'user-123',
        cacheKey: 'ptpTask-1'
      });
      await CacheModel.create({
        id: 'task-failed',
        status: 'failed',
        userId: 'user-123',
        cacheKey: 'ptpTask-2'
      });
      await CacheModel.create({
        id: 'task-pending',
        status: 'pending',
        userId: 'user-123',
        cacheKey: 'ptpTask-3'
      });
      await CacheModel.create({
        id: 'task-processing',
        status: 'processing',
        userId: 'user-123',
        cacheKey: 'ptpTask-4'
      });

      // Act
      const result = await ptpHandler.getPtpAsyncTasks({
        asyncTaskIds: ['task-completed', 'task-failed', 'task-pending', 'task-processing']
      });

      // Assert - all tasks should be in result
      expect(result).toHaveLength(4);

      // Verify completed and failed tasks were removed
      expect(await CacheModel.findByPk('task-completed')).toBeNull();
      expect(await CacheModel.findByPk('task-failed')).toBeNull();

      // Verify pending and processing tasks were preserved
      expect(await CacheModel.findByPk('task-pending')).not.toBeNull();
      expect(await CacheModel.findByPk('task-processing')).not.toBeNull();
    });

    test('should handle empty asyncTaskIds array', async () => {
      // Arrange
      await CacheModel.create({
        id: 'some-task',
        status: 'completed',
        userId: 'user-123',
        cacheKey: 'ptpTask-test'
      });

      // Act
      const result = await ptpHandler.getPtpAsyncTasks({
        asyncTaskIds: []
      });

      // Assert
      expect(result).toEqual([]);

      // Verify existing task was not touched
      const existingTask = await CacheModel.findByPk('some-task');
      expect(existingTask).not.toBeNull();
    });

    test('should preserve initialized status tasks in cache', async () => {
      // Arrange
      await CacheModel.create({
        id: 'user-123-initialized-task',
        status: 'initialized',
        userId: 'user-123',
        cacheKey: 'ptpTask-googleDrive'
      });

      // Act
      const result = await ptpHandler.getPtpAsyncTasks({
        asyncTaskIds: ['user-123-initialized-task']
      });

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ cacheKey: 'ptpTask-googleDrive', status: 'initialized' });

      // Verify task was NOT removed from cache
      const remainingTask = await CacheModel.findByPk('user-123-initialized-task');
      expect(remainingTask).not.toBeNull();
    });
  });
});

