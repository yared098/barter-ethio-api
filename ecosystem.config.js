module.exports = {
  apps: [
    {
      name: 'barter-ethio-api',
      script: 'dist/main.js',
      cwd: '/home/smrestpr/barter-ethio-api',
      env: {
        NODE_ENV: 'production',
        TOKIO_WORKER_THREADS: '1',
        RAYON_NUM_THREADS: '1',
        UV_THREADPOOL_SIZE: '2',
      },
    },
  ],
};
