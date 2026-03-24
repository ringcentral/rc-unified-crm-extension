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

const pluginHandler = require('../../handlers/plugin');
const { CacheModel } = require('../../models/cacheModel');
const { sequelize } = require('../../models/sequelize');

describe('Plugin Handler', () => {
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

  describe('getPluginAsyncTasks', () => {
    test('should retrieve async task status by IDs from CacheModel', async () => {
      // Arrange
      await CacheModel.create({
        id: 'user-123-task-1',
        status: 'processing',
        userId: 'user-123',
        cacheKey: 'pluginTask-googleDrive'
      });
      await CacheModel.create({
        id: 'user-123-task-2',
        status: 'completed',
        userId: 'user-123',
        cacheKey: 'pluginTask-piiRedaction'
      });

      // Act
      const result = await pluginHandler.getPluginAsyncTasks({
        asyncTaskIds: ['user-123-task-1', 'user-123-task-2']
      });

      // Assert
      expect(result).toHaveLength(2);
      expect(result).toContainEqual({ cacheKey: 'pluginTask-googleDrive', status: 'processing' });
      expect(result).toContainEqual({ cacheKey: 'pluginTask-piiRedaction', status: 'completed' });
    });

    test('should return empty array when no matching tasks found', async () => {
      // Arrange - no tasks created

      // Act
      const result = await pluginHandler.getPluginAsyncTasks({
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
        cacheKey: 'pluginTask-googleDrive'
      });
      await CacheModel.create({
        id: 'user-456-task-2',
        status: 'completed',
        userId: 'user-456',
        cacheKey: 'pluginTask-piiRedaction'
      });
      await CacheModel.create({
        id: 'user-789-task-3',
        status: 'failed',
        userId: 'user-789',
        cacheKey: 'pluginTask-other'
      });

      // Act - only request tasks for user-123 and user-789
      const result = await pluginHandler.getPluginAsyncTasks({
        asyncTaskIds: ['user-123-task-1', 'user-789-task-3']
      });

      // Assert
      expect(result).toHaveLength(2);
      expect(result).toContainEqual({ cacheKey: 'pluginTask-googleDrive', status: 'processing' });
      expect(result).toContainEqual({ cacheKey: 'pluginTask-other', status: 'failed' });
      expect(result).not.toContainEqual(expect.objectContaining({ cacheKey: 'pluginTask-piiRedaction' }));
    });

    test('should automatically remove completed tasks from cache after retrieval', async () => {
      // Arrange
      await CacheModel.create({
        id: 'user-123-completed-task',
        status: 'completed',
        userId: 'user-123',
        cacheKey: 'pluginTask-googleDrive'
      });

      // Act
      const result = await pluginHandler.getPluginAsyncTasks({
        asyncTaskIds: ['user-123-completed-task']
      });

      // Assert - result should contain the task
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ cacheKey: 'pluginTask-googleDrive', status: 'completed' });

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
        cacheKey: 'pluginTask-piiRedaction'
      });

      // Act
      const result = await pluginHandler.getPluginAsyncTasks({
        asyncTaskIds: ['user-123-failed-task']
      });

      // Assert - result should contain the task
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ cacheKey: 'pluginTask-piiRedaction', status: 'failed' });

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
        cacheKey: 'pluginTask-googleDrive'
      });

      // Act
      const result = await pluginHandler.getPluginAsyncTasks({
        asyncTaskIds: ['user-123-pending-task']
      });

      // Assert - result should contain the task
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ cacheKey: 'pluginTask-googleDrive', status: 'pending' });

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
        cacheKey: 'pluginTask-piiRedaction'
      });

      // Act
      const result = await pluginHandler.getPluginAsyncTasks({
        asyncTaskIds: ['user-123-processing-task']
      });

      // Assert - result should contain the task
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ cacheKey: 'pluginTask-piiRedaction', status: 'processing' });

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
        cacheKey: 'pluginTask-1'
      });
      await CacheModel.create({
        id: 'task-failed',
        status: 'failed',
        userId: 'user-123',
        cacheKey: 'pluginTask-2'
      });
      await CacheModel.create({
        id: 'task-pending',
        status: 'pending',
        userId: 'user-123',
        cacheKey: 'pluginTask-3'
      });
      await CacheModel.create({
        id: 'task-processing',
        status: 'processing',
        userId: 'user-123',
        cacheKey: 'pluginTask-4'
      });

      // Act
      const result = await pluginHandler.getPluginAsyncTasks({
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
        cacheKey: 'pluginTask-test'
      });

      // Act
      const result = await pluginHandler.getPluginAsyncTasks({
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
        cacheKey: 'pluginTask-googleDrive'
      });

      // Act
      const result = await pluginHandler.getPluginAsyncTasks({
        asyncTaskIds: ['user-123-initialized-task']
      });

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ cacheKey: 'pluginTask-googleDrive', status: 'initialized' });

      // Verify task was NOT removed from cache
      const remainingTask = await CacheModel.findByPk('user-123-initialized-task');
      expect(remainingTask).not.toBeNull();
    });
  });
});

