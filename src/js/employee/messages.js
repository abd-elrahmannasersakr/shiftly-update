// Employee → Messages section: read-only inbox.
(function () {
  async function render(root, { employeeId }) {
    root.innerHTML = '';
    root.appendChild(U.el('div', { class: 'page-header' }, [
      U.el('div', {}, [
        U.el('div', { class: 'page-title' }, ['الرسائل']),
        U.el('div', { class: 'page-subtitle' }, ['الرسائل الواردة من المدير - اضغط على الرسالة لقراءتها.'])
      ])
    ]));

    const card = U.el('div', { class: 'card' });
    card.appendChild(U.el('div', { class: 'card-title' }, ['صندوق الوارد']));
    const body = U.el('div');
    card.appendChild(body);
    root.appendChild(card);

    async function refresh() {
      const rows = await API['messages:listByEmployee']({ employee_id: employeeId, limit: 200 });
      const unreadCount = rows.filter((r) => !r.read).length;

      // Update sidebar badge
      if (window.App && window.App.updateMessagesBadge) {
        window.App.updateMessagesBadge(unreadCount);
      }

      renderList(body, rows, refresh, unreadCount);
    }
    refresh();
  }

  function renderList(root, rows, refresh, totalUnread) {
    root.innerHTML = '';
    if (!rows.length) {
      root.innerHTML = '<div class="empty" style="padding:40px;text-align:center;color:#9ca3af;">لا توجد رسائل</div>';
      return;
    }

    // Unread summary
    if (totalUnread > 0) {
      root.appendChild(U.el('div', {
        style: 'background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:10px 14px;margin-bottom:14px;display:flex;align-items:center;gap:8px;'
      }, [
        U.el('span', { style: 'font-size:20px;' }, ['🔔']),
        U.el('div', {}, [
          U.el('div', { style: 'font-weight:700;color:#dc2626;font-size:13px;' }, ['لديك ' + totalUnread + ' رسالة غير مقروءة']),
          U.el('div', { style: 'font-size:11px;color:#b91c1c;' }, ['اضغط على الرسالة لقراءتها'])
        ])
      ]));
    }

    const list = U.el('div');
    rows.forEach((r) => {
      const isUnread = !r.read;
      const item = U.el('div', {
        style: `padding:14px;border:1px solid ${isUnread ? '#bfdbfe' : '#e5e7eb'};border-radius:10px;margin-bottom:10px;cursor:pointer;background:${isUnread ? '#eff6ff' : 'white'};transition:all .15s;`,
        onclick: async () => {
          if (isUnread) {
            try {
              await API['messages:markRead']({ id: r.id });
              refresh();
            } catch (e) { U.toast(e.message, 'error'); }
          }
        }
      });
      const head = U.el('div', { class: 'flex-between mb-2' }, [
        U.el('div', {}, [
          isUnread
            ? U.el('span', { class: 'badge badge-danger', style: 'background:#dc2626;color:white;' }, ['غير مقروءة'])
            : U.el('span', { class: 'badge badge-gray' }, ['مقروءة'])
        ]),
        U.el('span', { class: 'muted' }, [U.fmtDateTime(r.created_at)])
      ]);
      const msgBody = U.el('div', { style: 'color:#374151;line-height:1.7;white-space:pre-wrap;' }, [r.body]);
      item.appendChild(head);
      item.appendChild(msgBody);
      if (r.read && r.read_at) {
        item.appendChild(U.el('div', { class: 'muted mt-2' }, [`تمت القراءة في: ${U.fmtDateTime(r.read_at)}`]));
      }
      list.appendChild(item);
    });
    root.appendChild(list);
  }

  window.EmployeeMessages = { render };
})();
