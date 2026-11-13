// Servidor HTTP de la app: API JSON, eventos SSE y la UI compilada. Solo escucha en 127.0.0.1 y,
// cuando hay token de sesión, la API lo exige (cabecera X-ZD-Token o ?t= para EventSource).

import express from 'express';
import { EventEmitter } from 'node:events';
import * as hubspot from './hubspot.js';
import { HttpError } from './repo.js';

export function startServer({ repo, documents = null, port = 0, token = null, staticDir = null, meta = {} }) {
	const bus = new EventEmitter();
	bus.setMaxListeners(100);
	const app = express();
	app.disable('x-powered-by');
	app.use(express.json({ limit: '1mb' }));

	app.use('/api', (req, res, next) => {
		if (!token || req.get('X-ZD-Token') === token || req.query.t === token) return next();
		res.status(401).json({ error: 'No autorizado' });
	});

	// Tras cada cambio, avisa a las ventanas (SSE) y al proceso principal (tray, avisos).
	app.use('/api', (req, res, next) => {
		if (req.method !== 'GET') {
			res.on('finish', () => {
				if (res.statusCode < 400) bus.emit('change', { client: req.get('X-ZD-Client') ?? null, path: req.path });
			});
		}
		next();
	});

	const id = (req) => {
		const n = Number(req.params.id);
		if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'ID no válido');
		return n;
	};

	// Documentos de una PoC o RFP (ver server/documents.js). pocKind da 404 si la ficha no existe.
	const docsId = (req) => {
		const pocId = id(req);
		repo.pocKind(pocId);
		if (!documents) throw new HttpError(501, 'Sin carpeta de documentos');
		return pocId;
	};

	async function portalId() {
		let portal = repo.getSettings().hubspot_portal_id;
		if (!portal) {
			portal = await hubspot.fetchPortalId().catch(() => null);
			if (portal) repo.setSettings({ hubspot_portal_id: portal });
		}
		return portal || null;
	}

	const r = express.Router();

	r.get('/items', (req, res) =>
		res.json(
			repo.listItems(req.query.view, {
				pocId: req.query.poc ? Number(req.query.poc) : undefined,
				includePoc: req.query.includePoc === '1',
			}),
		),
	);
	r.post('/items', (req, res) => res.status(201).json(repo.createItem(req.body)));
	r.post('/items/reorder', (req, res) => {
		repo.reorderItems(req.body?.ids);
		res.json({ ok: true });
	});
	r.get('/items/:id', (req, res) => res.json(repo.getItem(id(req))));
	r.patch('/items/:id', (req, res) => res.json(repo.updateItem(id(req), req.body)));
	r.delete('/items/:id', (req, res) => {
		repo.purgeItem(id(req));
		res.json({ ok: true });
	});
	r.post('/items/:id/complete', (req, res) => res.json(repo.completeItem(id(req))));
	r.post('/items/:id/reopen', (req, res) => res.json(repo.reopenItem(id(req))));
	r.post('/items/:id/touch', (req, res) => res.json(repo.touchItem(id(req), req.body ?? {})));
	r.post('/items/:id/reply', (req, res) => res.json(repo.replyItem(id(req), req.body ?? {})));
	r.post('/items/:id/note', (req, res) => res.status(201).json(repo.addNote({ item_id: id(req), body: req.body?.body })));
	r.post('/notes', (req, res) =>
		res.status(201).json(repo.addNote({ poc_id: Number(req.body?.poc_id) || null, company: req.body?.company, body: req.body?.body })),
	);
	r.post('/items/:id/delete', (req, res) => res.json(repo.deleteItem(id(req))));
	r.post('/items/:id/restore', (req, res) => res.json(repo.restoreItem(id(req))));
	r.delete('/activity/:id', (req, res) => res.json({ item: repo.deleteActivity(id(req)) }));
	r.post('/trash/empty', (req, res) => res.json({ deleted: repo.emptyTrash() }));
	r.get('/counts', (req, res) => res.json(repo.counts()));

	r.get('/pocs', (req, res) => res.json(repo.listPocs()));
	r.post('/pocs', (req, res) => res.status(201).json(repo.createPoc(req.body, { useTemplate: !!req.body?.use_template })));
	r.get('/pocs/stale', (req, res) => res.json(repo.stalePocs()));
	r.get('/rfps/deadlines', (req, res) => res.json(repo.rfpDeadlines()));
	r.post('/pocs/:id/stale-snooze', (req, res) => res.json(repo.snoozeStalePoc(id(req), req.body?.until ?? null)));
	r.get('/pocs/:id', (req, res) => res.json(repo.getPoc(id(req))));
	r.patch('/pocs/:id', (req, res) => res.json(repo.updatePoc(id(req), req.body)));
	r.delete('/pocs/:id', async (req, res) => {
		const pocId = id(req);
		const kind = repo.pocKind(pocId);
		repo.deletePoc(pocId);
		if (documents) await documents.removeAll(pocId, kind).catch((e) => console.error('Documentos de la ficha', e));
		res.json({ ok: true });
	});
	r.get('/pocs/:id/documents', (req, res) => {
		const pocId = id(req);
		repo.pocKind(pocId);
		res.json(documents ? documents.list(pocId) : []);
	});
	// El cuerpo es el archivo tal cual (no JSON): se guarda en streaming, sin cargarlo en memoria.
	r.post('/pocs/:id/documents', async (req, res) => {
		const pocId = docsId(req);
		let name;
		try {
			name = decodeURIComponent(req.get('X-Filename') ?? '');
		} catch {
			throw new HttpError(400, 'Nombre de documento no válido');
		}
		res.status(201).json(await documents.save(pocId, name, req));
	});
	r.post('/pocs/:id/links', async (req, res) => {
		res.status(201).json(await documents.addLink(docsId(req), req.body?.url, req.body?.title));
	});
	r.get('/pocs/:id/documents/:name', (req, res) => res.sendFile(documents.pathOf(docsId(req), req.params.name)));
	r.delete('/pocs/:id/documents/:name', async (req, res) => {
		await documents.remove(docsId(req), req.params.name);
		res.json({ ok: true });
	});
	r.post('/pocs/:id/status', (req, res) => res.json(repo.setPocStatus(id(req), req.body ?? {})));
	r.post('/pocs/:id/note', (req, res) => res.status(201).json(repo.addNote({ poc_id: id(req), body: req.body?.body })));
	r.post('/pocs/:id/admins', (req, res) => res.status(201).json(repo.addPocAdmin(id(req), req.body)));
	r.patch('/poc-admins/:id', (req, res) => res.json(repo.updatePocAdmin(id(req), req.body)));
	r.delete('/poc-admins/:id', (req, res) => {
		repo.deletePocAdmin(id(req));
		res.json({ ok: true });
	});
	r.post('/pocs/:id/hubspot/sync', async (req, res) => {
		const { poc } = repo.getPoc(id(req));
		if (!poc.hubspot_deal_id) throw new HttpError(400, 'Esta PoC no tiene deal de HubSpot');
		const deal = await hubspot.fetchDeal(poc.hubspot_deal_id, await portalId());
		if (poc.hubspot_url) delete deal.url;
		res.json(repo.applyHubspotDeal(poc.id, deal));
	});

	r.get('/hubspot/status', (req, res) => res.json({ connected: hubspot.hasToken() }));
	r.get('/hubspot/search', async (req, res) => res.json(await hubspot.searchDeals(req.query.q ?? '', await portalId())));

	r.get('/accounts', (req, res) => res.json(repo.listAccounts()));
	r.get('/accounts/:name', (req, res) => res.json(repo.getAccount(req.params.name)));
	r.put('/accounts/:name/hubspot', (req, res) => res.json(repo.setAccountHubspot(req.params.name, req.body?.hubspot)));
	r.get('/stats', (req, res) => res.json(repo.stats(req.query.weeks, req.query.region)));
	r.get('/weeks', (req, res) => res.json(repo.listWeeks()));
	r.get('/weeks/:week', (req, res) => res.json(repo.getWeek(req.params.week)));
	r.get('/search', (req, res) => res.json(repo.search(String(req.query.q ?? ''))));
	r.get('/search/items', (req, res) => res.json(repo.searchItems(String(req.query.q ?? ''))));
	r.get('/suggestions', (req, res) => res.json(repo.suggestions()));
	r.get('/settings', (req, res) => res.json(repo.getSettings()));
	r.patch('/settings', (req, res) => res.json(repo.setSettings(req.body)));
	r.get('/meta', (req, res) => res.json({ ...meta, today: repo.today() }));

	r.get('/events', (req, res) => {
		res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
		res.flushHeaders();
		res.write('retry: 2000\n\n');
		const send = (e) => res.write(`event: change\ndata: ${JSON.stringify(e)}\n\n`);
		const ping = setInterval(() => res.write(': ping\n\n'), 25000);
		bus.on('change', send);
		req.on('close', () => {
			clearInterval(ping);
			bus.off('change', send);
		});
	});

	app.use('/api', r);
	app.use('/api', (req, res) => res.status(404).json({ error: 'No existe' }));
	if (staticDir) app.use(express.static(staticDir));

	app.use((err, req, res, _next) => {
		const status = err.status ?? (err.type === 'entity.parse.failed' ? 400 : 500);
		if (status >= 500 && !(err instanceof HttpError)) console.error(err);
		res.status(status).json({ error: status >= 500 && !(err instanceof HttpError) ? 'Error interno' : err.message });
	});

	return new Promise((resolve, reject) => {
		const server = app.listen(port, '127.0.0.1', () =>
			resolve({ port: server.address().port, bus, close: () => new Promise((done) => server.close(done)) }),
		);
		server.on('error', reject);
	});
}
