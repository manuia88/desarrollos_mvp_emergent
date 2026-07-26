"""Wave 1 · Tests cron_heartbeat.py · 12 tests unidad sin DB.

Cubre:
- SCHEDULE_LABELS / SCHEDULE_INTERVAL_SEC integrity (constants críticas)
- is_stale (detección stale crons · fundamental para alertas system health)

Funciones async/DB (heartbeat_start · heartbeat_end · reset_24h_counters · wrap_apscheduler_job)
→ tests integration en sesión separada (necesitan mongomock).

NO toca infra · NO modifica código · solo lectura.
"""
import pytest
from datetime import timedelta

from cron_heartbeat import (
    is_stale,
    SCHEDULE_LABELS,
    SCHEDULE_INTERVAL_SEC,
    _now,
    set_db,
)


pytestmark = pytest.mark.unit


# ─── 1. is_stale: detección core para alertas system health ─────────────────


def test_is_stale_none_returns_true():
    """Heartbeat None / vacío → considera stale (sin info = peligroso)."""
    assert is_stale(None) is True
    assert is_stale({}) is True


def test_is_stale_missing_last_run_returns_true():
    """Sin last_run_at → stale."""
    hb = {"job_id": "ie_daily_ingestion"}
    assert is_stale(hb) is True


def test_is_stale_recent_run_returns_false():
    """last_run_at hace <2× interval → NO stale."""
    # ie_hourly_status: interval 3600s · 2x = 7200s
    # Si corrió hace 30 min · NO stale
    recent = (_now() - timedelta(minutes=30)).isoformat()
    hb = {"job_id": "ie_hourly_status", "last_run_at": recent}
    assert is_stale(hb) is False


def test_is_stale_ancient_run_returns_true():
    """last_run_at hace >>2× interval → stale."""
    # ie_hourly_status: interval 3600s · 2x = 7200s
    # Si corrió hace 24h · MUY stale
    ancient = (_now() - timedelta(hours=24)).isoformat()
    hb = {"job_id": "ie_hourly_status", "last_run_at": ancient}
    assert is_stale(hb) is True


def test_is_stale_borderline_below_threshold_not_stale():
    """last_run_at justo bajo 2× interval → NO stale (threshold inclusive)."""
    # health_critical_check: interval 5*60 = 300s · 2x = 600s
    # Si corrió hace 9 min (540s) · NO stale (<600s)
    borderline = (_now() - timedelta(seconds=540)).isoformat()
    hb = {"job_id": "health_critical_check", "last_run_at": borderline}
    assert is_stale(hb) is False


def test_is_stale_borderline_above_threshold_is_stale():
    """last_run_at justo sobre 2× interval → stale."""
    # health_critical_check: interval 300s · 2x = 600s
    # Si corrió hace 11 min (660s) · stale (>600s)
    over = (_now() - timedelta(seconds=660)).isoformat()
    hb = {"job_id": "health_critical_check", "last_run_at": over}
    assert is_stale(hb) is True


def test_is_stale_unknown_job_no_asume_que_corre_cada_hora():
    """Un trabajo de ritmo DESCONOCIDO no se marca atrasado a las 2 horas.

    Antes el valor por defecto era 1 hora, así que cualquier trabajo no declarado se reportaba como
    crítico a las 2 horas. De 72 trabajos, 26 caían ahí: produjo 84 alertas críticas casi todas
    falsas, y un tablero que grita por nada entrena a ignorarlo (auditoría 07-26).
    Sin saber su ritmo se le da un día de margen; 10 horas ya no es motivo de alarma.
    """
    fresh = (_now() - timedelta(minutes=30)).isoformat()
    assert is_stale({"job_id": "job_unknown_xyz", "last_run_at": fresh}) is False

    diez_horas = (_now() - timedelta(hours=10)).isoformat()
    assert is_stale({"job_id": "job_unknown_xyz", "last_run_at": diez_horas}) is False

    cuatro_dias = (_now() - timedelta(days=4)).isoformat()
    assert is_stale({"job_id": "job_unknown_xyz", "last_run_at": cuatro_dias}) is True


def test_is_stale_deduce_el_ritmo_del_nombre():
    """`_daily`, `_weekly`, `_monthly` en el nombre dicen cada cuánto corre."""
    hace_dos_dias = (_now() - timedelta(days=2)).isoformat()
    # un trabajo MENSUAL a los 2 días está a tiempo; antes se marcaba crítico
    assert is_stale({"job_id": "algo_monthly", "last_run_at": hace_dos_dias}) is False
    assert is_stale({"job_id": "algo_weekly", "last_run_at": hace_dos_dias}) is False
    # uno diario a los 3 días SÍ está atrasado (su margen es 2× 26h ≈ 2.2 días)
    hace_tres_dias = (_now() - timedelta(days=3)).isoformat()
    assert is_stale({"job_id": "algo_daily", "last_run_at": hace_tres_dias}) is True


def test_is_stale_usa_el_ritmo_MEDIDO_cuando_no_esta_declarado():
    """Si el sistema ya observó cada cuánto corre, ese dato manda sobre cualquier suposición."""
    hace_3h = (_now() - timedelta(hours=3)).isoformat()
    # ritmo medido de 30 min → a las 3 horas lleva 6× su ritmo: atrasado
    assert is_stale({"job_id": "job_medido", "last_run_at": hace_3h,
                     "intervalo_observado_sec": 1800}) is True
    # ritmo medido de 6 h → a las 3 horas va a tiempo
    assert is_stale({"job_id": "job_medido", "last_run_at": hace_3h,
                     "intervalo_observado_sec": 6 * 3600}) is False


def test_is_stale_invalid_date_format_returns_true():
    """last_run_at con formato inválido → stale (defensive · prefiere alertar)."""
    hb = {"job_id": "ie_hourly_status", "last_run_at": "not-a-valid-date"}
    assert is_stale(hb) is True


def test_is_stale_handles_z_suffix_isoformat():
    """ISO format con 'Z' suffix (UTC marker) parsea OK."""
    recent = _now() - timedelta(minutes=30)
    iso_with_z = recent.isoformat().replace("+00:00", "Z")
    hb = {"job_id": "ie_hourly_status", "last_run_at": iso_with_z}
    assert is_stale(hb) is False


# ─── 2. Constants integrity ──────────────────────────────────────────────────


def test_schedule_labels_includes_critical_jobs():
    """SCHEDULE_LABELS debe incluir jobs críticos system health (W1.3 + agregados)."""
    critical_jobs = [
        "ie_daily_ingestion",      # W1.4 ZZ.1 bulk drive
        "ie_hourly_status",
        "drive_watcher",
        "health_critical_check",
        "data_hub_healthcheck_all",
        "ai_cost_daily_aggregation",
    ]
    for job in critical_jobs:
        assert job in SCHEDULE_LABELS, f"job '{job}' falta en SCHEDULE_LABELS"


def test_schedule_intervals_include_all_labeled_jobs():
    """Todo job en SCHEDULE_LABELS debe tener su interval en SCHEDULE_INTERVAL_SEC."""
    labels_set = set(SCHEDULE_LABELS.keys())
    intervals_set = set(SCHEDULE_INTERVAL_SEC.keys())
    missing = labels_set - intervals_set
    assert not missing, f"Jobs sin interval: {missing}"


def test_schedule_intervals_are_positive_integers():
    """Cada interval debe ser positivo · usado en arithmetic timedelta."""
    for job_id, interval in SCHEDULE_INTERVAL_SEC.items():
        assert isinstance(interval, int), f"{job_id}: interval no es int"
        assert interval > 0, f"{job_id}: interval no es positivo ({interval})"


# ─── 3. set_db: global mutator (smoke check) ─────────────────────────────────


def test_set_db_stores_reference():
    """set_db modifica _DB_REF global · usado para wrappers sin db arg."""
    import cron_heartbeat as ch
    sentinel = "test-db-sentinel"
    set_db(sentinel)
    assert ch._DB_REF == sentinel
    set_db(None)  # cleanup
    assert ch._DB_REF is None
