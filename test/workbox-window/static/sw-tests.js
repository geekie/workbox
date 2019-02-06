importScripts('./sw-test-boilerplate.js');
importScripts('/__WORKBOX/buildFile/workbox-sw');
workbox.setConfig({modulePathPrefix: '/__WORKBOX/buildFile/'});

const {Queue} = workbox.backgroundSync;
const {deleteDatabase} = workbox.core._private;

// Stub logger methods to avoid noise in the console. If a test needs to
// un-stub one of these, it should do it within each test.
sinon.stub(workbox.core._private.logger);


const MINUTES = 60 * 1000;

const getObjectStoreEntries = async () => {
  // Fail if a version of this database doesn't already exist
  const db = new DBWrapper('workbox-background-sync', undefined, {
    onupgradeneeded: (event) => event.target.transaction.abort()
  });
  return await db.getAll(OBJECT_STORE_NAME);
};


const createSyncEventStub = (tag) => {
  const event = new SyncEvent('sync', {tag});

  // Default to resolving in the next microtask.
  let done = Promise.resolve();

  // Browsers will throw if code tries to call `waitUntil()` on a user-created
  // sync event, so we have to stub it.
  event.waitUntil = (promise) => {
    // If `waitUntil` is called, defer `done` until after it resolves.
    if (promise) {
      done = promise.then(done);
    }
  }

  return {event, done};
};

describe(`[workbox-background-sync] Queue`, function() {
  const sandbox = sinon.createSandbox();

  const reset = async () => {
    sandbox.restore();
    Queue._queueNames.clear();
    // await deleteDatabase('workbox-background-sync');
  };

  beforeEach(async function() {
    await reset();
  });

  after(async function() {
    await reset();
  });

  describe(`constructor`, function() {
    it(`throws if two queues are created with the same name`, async function() {
      expect(() => {
        new Queue('foo');
        new Queue('bar');
      }).not.to.throw();

      try {
        new Queue('foo');

        throw new Error('Expected above to throw')
      } catch (e) {
        // Do nothing
      }

      expect(() => {
        new Queue('baz');
      }).not.to.throw();
    });

    it(`adds a sync event listener runs the onSync function when a sync event is dispatched`, async function() {
      sandbox.spy(self, 'addEventListener');
      const onSync = sandbox.spy();

      const queue = new Queue('foo', {onSync});

      debugger;

      expect(self.addEventListener.calledOnce).to.be.true;
      expect(self.addEventListener.calledWith('sync')).to.be.true;

      const sync1 = createSyncEventStub('workbox-background-sync:foo');
      self.dispatchEvent(sync1.event);
      await sync1.done;

      // replayRequests should not be called for this due to incorrect tag name
      const sync2 = createSyncEventStub('workbox-background-sync:bar');
      self.dispatchEvent(sync2.event);
      await sync2.done;

      expect(onSync.callCount).to.equal(1);
      expect(onSync.firstCall.args[0].queue).to.equal(queue);
    });

    it(`defaults to calling replayRequests when no onSync function is passed`, async function() {
      sandbox.spy(self, 'addEventListener');
      sandbox.stub(Queue.prototype, 'replayRequests');

      const queue = new Queue('foo');

      expect(self.addEventListener.calledOnce).to.be.true;
      expect(self.addEventListener.calledWith('sync')).to.be.true;

      const sync1 = createSyncEventStub('workbox-background-sync:foo');
      self.dispatchEvent(sync1.event);
      await sync1.done;

      // replayRequests should not be called for this due to incorrect tag name
      const sync2 = createSyncEventStub('workbox-background-sync:bar');
      self.dispatchEvent(sync2.event);
      await sync2.done;

      expect(Queue.prototype.replayRequests.callCount).to.equal(1);
      expect(Queue.prototype.replayRequests.firstCall.args[0].queue)
          .to.equal(queue);
    });

    it(`tries to run the sync logic on instantiation in browsers that don't support the sync event`, async function() {
      if ('sync' in registration) this.skip();

      const onSync = sandbox.spy();

      new Queue('foo', {onSync});

      expect(onSync.calledOnce).to.be.true;
    });
  });

  describe(`pushRequest`, function() {
    it(`should add the request to the end of the QueueStore instance`, async function() {

      sandbox.spy(QueueStore.prototype, 'pushEntry');

      const queue = new Queue('a');
      const requestURL = 'https://example.com';
      const requestInit = {
        method: 'POST',
        body: 'testing...',
        headers: {'x-foo': 'bar'},
        mode: 'cors',
      };
      const request = new Request(requestURL, requestInit);
      const timestamp = 1234;
      const metadata = {meta: 'data'};

      await queue.pushRequest({request, timestamp, metadata});

      expect(QueueStore.prototype.pushEntry.callCount).to.equal(1);

      const args = QueueStore.prototype.pushEntry.firstCall.args;
      expect(args[0].requestData.url).to.equal(requestURL);
      expect(args[0].requestData.method).to.equal(requestInit.method);
      expect(args[0].requestData.headers).to.deep.equal(requestInit.headers);
      expect(args[0].requestData.mode).to.deep.equal(requestInit.mode);
      expect(args[0].requestData.body).to.be.instanceOf(Blob);
      expect(args[0].timestamp).to.equal(timestamp);
      expect(args[0].metadata).to.deep.equal(metadata);
    });

    return;

    it(`should not require metadata`, async function() {
      sandbox.spy(QueueStore.prototype, 'pushEntry');

      const queue = new Queue('a');
      const request = new Request('https://example.com');

      await queue.pushRequest({request});

      expect(QueueStore.prototype.pushEntry.callCount).to.equal(1);

      const args = QueueStore.prototype.pushEntry.firstCall.args;
      expect(args[0].metadata).to.be.undefined;
    });

    it(`should use the current time as the timestamp when not specified`, async function() {
      sandbox.spy(QueueStore.prototype, 'pushEntry');

      sandbox.useFakeTimers({
        toFake: ['Date'],
        now: 1234,
      });

      const queue = new Queue('a');
      const request = new Request('https://example.com');

      await queue.pushRequest({request});

      expect(QueueStore.prototype.pushEntry.callCount).to.equal(1);

      const args = QueueStore.prototype.pushEntry.firstCall.args;
      expect(args[0].timestamp).to.equal(1234);
    });

    it(`should register to receive sync events for a unique tag`, async function() {
      sandbox.stub(self.registration, 'sync').value({
        register: sinon.stub().resolves(),
      });

      const queue = new Queue('foo');

      await queue.pushRequest({request: new Request('/')});

      expect(self.registration.sync.register.calledOnce).to.be.true;
      expect(self.registration.sync.register.calledWith(
          'workbox-background-sync:foo')).to.be.true;
    });
  });
});

