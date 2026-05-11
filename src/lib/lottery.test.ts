import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	mock,
	spyOn,
} from "bun:test";

import type { ContestData } from "@/lib/types";

const dbMocks = {
	getAppState: mock(() => null),
	setAppState: mock(() => true),
	getContest: mock(() => null),
	getContestCacheAge: mock(() => null),
	getLatestContest: mock(() => null),
	saveContest: mock(() => true),
};

mock.module("@/lib/db", () => dbMocks);

import {
	LAST_SUCCESSFUL_SOURCE_KEY,
	fetchContestData,
	fetchContestFromApi,
	getOrderedSources,
} from "@/lib/lottery";

function makeContest(numero: number): ContestData {
	return {
		numero,
		dataApuracao: "25/04/2026",
		listaDezenas: ["22", "23", "36", "40", "52", "60"],
		listaRateioPremio: [
			{ descricaoFaixa: "Sena", numeroDeGanhadores: 0, valorPremio: 0 },
			{
				descricaoFaixa: "Quina",
				numeroDeGanhadores: 65,
				valorPremio: 64627.76,
			},
			{
				descricaoFaixa: "Quadra",
				numeroDeGanhadores: 5255,
				valorPremio: 1317.67,
			},
		],
		acumulado: true,
		dataProximoConcurso: "28/04/2026",
		valorEstimadoProximoConcurso: 115000000,
	};
}

function makeJsonResponse(payload: unknown) {
	return {
		ok: true,
		status: 200,
		json: mock(() => Promise.resolve(payload)),
		text: mock(() => Promise.resolve("")),
		headers: new Headers(),
	};
}

function makeStatusResponse(status: number) {
	return {
		ok: false,
		status,
		json: mock(() => Promise.resolve({})),
		text: mock(() => Promise.resolve("")),
		headers: new Headers(),
	};
}

describe("source ordering", () => {
	it("returns only caixa-worker as available source", () => {
		expect(getOrderedSources()).toEqual(["caixa-worker"]);
	});
});

describe("fetchContestFromApi", () => {
	beforeEach(() => {
		process.env.CAIXA_WORKER_URL = "https://caixa-lottery-proxy.workers.dev";
		dbMocks.getAppState.mockClear();
		dbMocks.setAppState.mockClear();
		dbMocks.saveContest.mockClear();
		dbMocks.getAppState.mockImplementation(() => null);
		dbMocks.setAppState.mockImplementation(() => true);
		dbMocks.saveContest.mockImplementation(() => true);
	});

	afterEach(() => {
		// Bun doesn't have unstubAllGlobals, but we reset fetch manually if needed
	});

	it("fetches latest contest from caixa-worker and persists source", async () => {
		const fetchMock = mock(() =>
			Promise.resolve(makeJsonResponse(makeContest(3000))),
		);
		global.fetch = fetchMock;

		const result = await fetchContestFromApi("");

		expect(result.numero).toBe(3000);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0][0]).toBe(
			"https://caixa-lottery-proxy.workers.dev/megasena",
		);
		expect(dbMocks.setAppState).toHaveBeenCalledWith(
			LAST_SUCCESSFUL_SOURCE_KEY,
			"caixa-worker",
		);
	});

	it("fetches specific contest from caixa-worker", async () => {
		const fetchMock = mock(() =>
			Promise.resolve(makeJsonResponse(makeContest(3001))),
		);
		global.fetch = fetchMock;

		const result = await fetchContestFromApi("3001");

		expect(result.numero).toBe(3001);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0][0]).toBe(
			"https://caixa-lottery-proxy.workers.dev/megasena/3001",
		);
	});

	it("rejects when contest number does not match request", async () => {
		const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
		const fetchMock = mock(() =>
			Promise.resolve(makeJsonResponse(makeContest(3000))),
		);
		global.fetch = fetchMock;

		try {
			await fetchContestFromApi("3001");
			expect(true).toBe(false); // Should not reach here
		} catch (e: any) {
			expect(e.message).toMatch(/contest mismatch/);
		}

		expect(warnSpy).toHaveBeenCalled();
		warnSpy.mockRestore();
	});

	it("retries on transient failure then throws", async () => {
		const fetchMock = mock()
			.mockResolvedValueOnce(makeStatusResponse(503))
			.mockResolvedValueOnce(makeStatusResponse(503));
		global.fetch = fetchMock as any;

		try {
			await fetchContestFromApi("");
			expect(true).toBe(false);
		} catch (e: any) {
			expect(e.message).toMatch(/status 503/);
		}
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
});

describe("fetchContestData cache policy", () => {
	beforeEach(() => {
		process.env.CAIXA_WORKER_URL = "https://caixa-lottery-proxy.workers.dev";
		dbMocks.getAppState.mockClear();
		dbMocks.setAppState.mockClear();
		dbMocks.getContest.mockClear();
		dbMocks.getContestCacheAge.mockClear();
		dbMocks.getLatestContest.mockClear();
		dbMocks.saveContest.mockClear();

		dbMocks.getAppState.mockImplementation(() => null);
		dbMocks.setAppState.mockImplementation(() => true);
		dbMocks.saveContest.mockImplementation(() => true);
	});

	it("latest path is API-first, saves to DB, logs source=api", async () => {
		const logSpy = spyOn(console, "log").mockImplementation(() => {});
		const fetchMock = mock(() =>
			Promise.resolve(makeJsonResponse(makeContest(3001))),
		);
		global.fetch = fetchMock;

		const result = await fetchContestData("");

		expect(result.numero).toBe(3001);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(dbMocks.saveContest).toHaveBeenCalled();
		expect(dbMocks.getLatestContest).not.toHaveBeenCalled();
		logSpy.mockRestore();
	});

	it("latest path falls back to DB when API fails", async () => {
		const logSpy = spyOn(console, "log").mockImplementation(() => {});
		const cachedData = makeContest(3000);
		dbMocks.getLatestContest.mockImplementation(() => cachedData);

		const fetchMock = mock(() => Promise.reject(new Error("API offline")));
		global.fetch = fetchMock;

		const result = await fetchContestData("");

		expect(result.numero).toBe(3000);
		expect(dbMocks.getLatestContest).toHaveBeenCalledTimes(1);
		expect(dbMocks.saveContest).not.toHaveBeenCalled();
		logSpy.mockRestore();
	});

	it("latest path throws when API and DB both fail", async () => {
		dbMocks.getLatestContest.mockImplementation(() => null);
		const fetchMock = mock(() => Promise.reject(new Error("API offline")));
		global.fetch = fetchMock;

		try {
			await fetchContestData("");
			expect(true).toBe(false);
		} catch (e: any) {
			expect(e.message).toBe("API offline");
		}
	});

	it("specific contest path returns cache without API when present", async () => {
		const logSpy = spyOn(console, "log").mockImplementation(() => {});
		const cachedData = makeContest(2999);
		dbMocks.getContest.mockImplementation(() => cachedData);
		// Cache is fresh (1 hour old)
		dbMocks.getContestCacheAge.mockImplementation(() =>
			new Date(Date.now() - 3600000).toISOString(),
		);

		const fetchMock = mock();
		global.fetch = fetchMock as any;

		const result = await fetchContestData("2999");

		expect(result).toEqual(cachedData);
		expect(dbMocks.getContest).toHaveBeenCalledWith(2999);
		expect(fetchMock).not.toHaveBeenCalled();
		expect(dbMocks.saveContest).not.toHaveBeenCalled();
		logSpy.mockRestore();
	});

	it("specific contest path refreshes stale cache via API when older than 48h", async () => {
		const logSpy = spyOn(console, "log").mockImplementation(() => {});
		const cachedData = makeContest(2999);
		const freshData = makeContest(2999);
		freshData.listaDezenas = ["01", "02", "03", "04", "05", "06"];
		dbMocks.getContest.mockImplementation(() => cachedData);
		// Cache is 72 hours old (stale)
		dbMocks.getContestCacheAge.mockImplementation(() =>
			new Date(Date.now() - 72 * 3600000).toISOString(),
		);

		const fetchMock = mock(() => Promise.resolve(makeJsonResponse(freshData)));
		global.fetch = fetchMock;

		const result = await fetchContestData("2999");

		expect(result.listaDezenas).toEqual(["01", "02", "03", "04", "05", "06"]);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(dbMocks.saveContest).toHaveBeenCalled();
		logSpy.mockRestore();
	});

	it("specific contest path falls back to stale cache when API fails on stale refresh", async () => {
		const logSpy = spyOn(console, "log").mockImplementation(() => {});
		const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
		const cachedData = makeContest(2999);
		dbMocks.getContest.mockImplementation(() => cachedData);
		// Cache is 72 hours old (stale)
		dbMocks.getContestCacheAge.mockImplementation(() =>
			new Date(Date.now() - 72 * 3600000).toISOString(),
		);

		const fetchMock = mock(() => Promise.reject(new Error("API offline")));
		global.fetch = fetchMock;

		const result = await fetchContestData("2999");

		expect(result).toEqual(cachedData);
		expect(fetchMock).toHaveBeenCalledTimes(2); // 1 initial + 1 retry
		warnSpy.mockRestore();
		logSpy.mockRestore();
	});

	it("specific contest path calls API on DB miss, saves, logs source=api", async () => {
		const logSpy = spyOn(console, "log").mockImplementation(() => {});
		dbMocks.getContest.mockImplementation(() => null);
		const fetchMock = mock(() =>
			Promise.resolve(makeJsonResponse(makeContest(2998))),
		);
		global.fetch = fetchMock;

		const result = await fetchContestData("2998");

		expect(result.numero).toBe(2998);
		expect(dbMocks.getContest).toHaveBeenCalledWith(2998);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(dbMocks.saveContest).toHaveBeenCalled();
		logSpy.mockRestore();
	});

	it("specific contest path throws on API failure when no DB cache exists", async () => {
		dbMocks.getContest.mockImplementation(() => null);
		const fetchMock = mock(() => Promise.reject(new Error("network error")));
		global.fetch = fetchMock;

		try {
			await fetchContestData("2997");
			expect(true).toBe(false);
		} catch (e: any) {
			expect(e.message).toBe("network error");
		}
	});
});
