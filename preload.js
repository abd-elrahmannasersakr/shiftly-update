const { contextBridge, ipcRenderer } = require('electron');

const channels = [
  // auth
  'auth:login', 'auth:changePassword', 'auth:resetEmployeeCredentials', 'auth:userForEmployee', 'auth:listAccounts',
  // employees
  'employees:list', 'employees:get', 'employees:create', 'employees:update', 'employees:delete',
  // attendance
  'attendance:checkIn', 'attendance:checkOut', 'attendance:listByEmployee',
  'attendance:managerEntry', 'attendance:today', 'attendance:openShifts',
  'attendance:delete', 'attendance:update',
  // cleaning
  'cleaning:create', 'cleaning:listByEmployee', 'cleaning:monthly',
  // salary adjustments
  'adjustments:create', 'adjustments:listByEmployee', 'adjustments:delete',
  // advances
  'advances:create', 'advances:listByEmployee', 'advances:delete',
  // messages
  'messages:create', 'messages:listByEmployee', 'messages:markRead',
  // revenues
  'revenues:create', 'revenues:listByEmployee', 'revenues:delete',
  // salary summary
  'salary:summary', 'salary:summaryAll',
  // policies (points)
  'policies:list', 'policies:create', 'policies:update', 'policies:delete',
  'appliedPolicies:apply', 'appliedPolicies:listByEmployee', 'appliedPolicies:delete', 'appliedPolicies:updatePoints',
  // settings + incentives
  'settings:get', 'settings:update',
  'settings:setKey', 'settings:getKey', 'settings:getMonthBases',
  'incentives:summary', 'employee:summary',
  // exit permissions
  'exitPermissions:request',
  'exitPermissions:listByEmployee',
  'exitPermissions:listAll',
  'exitPermissions:listToday',
  'exitPermissions:markNoted',
  'exitPermissions:approve',
  'exitPermissions:reject',
  // archive
  'archive:employeeMonth',
  'archive:allEmployeesMonth',
  // backup
  'backup:list',
  'backup:run',
  'backup:delete',
  'backup:usbStatus',
  'backup:setUsbEnabled',
  'backup:restore',
  'appliedPolicies:createDirect',
  // correction requests (time-edit requests from employee to manager)
  'correctionRequests:create',
  'correctionRequests:listByEmployee',
  'correctionRequests:listByEmployeeId',
  'correctionRequests:apply',
  'correctionRequests:reject',
  // التحديث التلقائي
  'update:check',
  'update:getVersion'
];

const api = {};
channels.forEach((ch) => {
  api[ch] = (payload) => ipcRenderer.invoke(ch, payload);
});

contextBridge.exposeInMainWorld('api', api);

// استقبال أحداث التحديث من Main Process
contextBridge.exposeInMainWorld('updater', {
  onStatus: (callback) => ipcRenderer.on('update:status', (_evt, data) => callback(data)),
  removeListeners: () => ipcRenderer.removeAllListeners('update:status')
});
