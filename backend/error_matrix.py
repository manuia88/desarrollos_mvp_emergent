"""MATRIZ DE ERRORES — el juez de jueces (founder 07-17: "que el sistema sepa qué NO
puede ver"). Cada RIESGO real del pipeline (campo × etapa × forma de fallar) declara qué
juez lo cubre — o admite que nadie. La regla operativa: cada error que un humano cace a
ojo = una celda sin juez = se crea el juez y se registra aquí.

La lista NO es el producto cartesiano (sería ruido): son los riesgos que YA nos mordieron
o que sabemos posibles, curados a mano. El % de cobertura se reporta en el parte."""
from __future__ import annotations

from typing import Any, Dict, List

# (campo, etapa, modo_de_falla, juez_que_lo_cubre | None, caso_que_lo_motivó)
CELDAS: List[tuple] = [
    # LEER — el PDF/Excel miente o esconde
    ("precio", "leer", "tapado_por_banner", "lista_forense.renglones_fantasma", "Jai 25L"),
    ("precio", "leer", "texto_entrelazado", "lista_forense._es_entrelazado", "Jai 25L"),
    ("unidad", "leer", "renglon_omitido", "lista_forense.renglones_fantasma", "Único Roma −8"),
    ("estado", "leer", "sombreado_invisible", "lista_forense.unidades_sombreadas", "Dessea 2-PH03"),
    ("unidad", "leer", "fila_partida", "doble lectura texto+coordenadas (peek/censo)", "Coyoacán 20 filas"),
    ("recamaras", "leer", "celda_ambigua", "extractores_layout._conteo", "'1 o 2' Lock-Off"),
    ("unidad", "leer", "nombrada_sin_digitos", "extractores_layout.es_nombrada", "ROOF PRIVADO $26.5M"),
    # INTERPRETAR — se leyó bien pero significa otra cosa
    ("precio", "interpretar", "implausible", "juez_automatico.PLAUSIBLE (capa 0)", "trust breach 07-16"),
    ("m2", "interpretar", "implausible", "juez_automatico.PLAUSIBLE (capa 0)", None),
    ("recamaras", "interpretar", "implausible", "juez_automatico.PLAUSIBLE (capa 0)", None),
    ("m2", "interpretar", "convencion_equivocada", "auditor.convencion_m2 por dev", "84 falsas Almina"),
    ("dinero", "interpretar", "columna_corrida", "auditor.dinero_coherencia", "Jai 25L medio-fix"),
    ("precio", "interpretar", "ppm2_fuera_de_gemelas", "auditor.r_ppm2_outlier", "Colima 509 penthouse mal transcrito"),
    ("m2", "interpretar", "specs_de_otro_depto", "auditor.r_ppm2_outlier", "Colima 509 Interior B→PH"),
    ("estado", "interpretar", "vocabulario_desconocido", "ingested_reader._STATUS_ES fail-visible", "804 bloqueada→disponible"),
    ("nivel", "interpretar", "prefijo_torre_como_piso", "nivel_vs_numero + nota manual", "Dessea 2-PH01 nivel 2"),
    ("torre", "interpretar", "torres_fusionadas", "unit_number con torre + firma 4D", "The Park 110→164"),
    ("etapa", "interpretar", "esquema_contradice_etapa", "jueces_negocio.esquema_vs_etapa", None),
    ("m2", "interpretar", "folleto_contradice_lista", "juez_cruzado.folleto_vs_lista", "Coyoacán 91 vs 64"),
    ("colonia", "interpretar", "nombre_marketing_engañoso", "juez_cruzado.nombre_vs_colonia", "'Coyoacán'=Portales Nte"),
    # COLOCAR — el dato correcto en el lugar equivocado
    ("plano", "colocar", "mal_amarrado", "plano_binder triple candado", "ALMINA_ARQ Torre B"),
    ("plano", "colocar", "version_flex_equivocada", "plano_binder regla FLEX", "B-304 2REC/3REC"),
    ("plano", "colocar", "girado_ilegible", "plano_orientacion (OSD+OCR)", "139 girados"),
    ("unidad", "colocar", "duplicada_sin_torre", "censo vs fuente + papelera", "Dessea PH01-03 dup"),
    ("unidad", "colocar", "existe_en_plano_no_en_lista", "juez_cruzado.plano_vs_lista", "Coyoacán 1802"),
    ("precio", "colocar", "campos_legacy_desalineados", "auditor.dinero_coherencia", "price vs price_mxn"),
    # PUBLICAR — lo que ve el usuario no es lo que hay
    ("foto", "publicar", "flyer_lona_colada", "galeria_judex.galeria_flyer (flag, ojos)", "CLASS 377 purgadas"),
    ("foto", "publicar", "duplicados", "galeria_judex dHash", None),
    ("foto", "publicar", "recorrido_incompleto", "galeria_judex.galeria_recorrido_incompleto", None),
    ("foto", "publicar", "negra_o_texto", "render_quality.es_negra_o_texto", "Park San Rafael"),
    ("estado", "publicar", "vendida_como_disponible", "censo_norma (lista ofrece vs BD)", None),
    ("campos", "publicar", "obligatorio_ausente", "auditor.campos_obligatorios tipo/status-aware", None),
    ("ficha", "publicar", "render_no_coincide_api", "verifica_ui local ($0)", "similares sin assetUrl"),
    ("general", "publicar", "total_derivado_de_disponibles", "auditor.r_general_coherente", "Chilpancingo 1→48, niveles"),
    ("general", "publicar", "numero_estimado_como_exacto", "auditor.r_general_coherente + flag _aprox (~)", "depas/piso 48÷5"),
    ("foto", "publicar", "pagina_de_brochure_como_render", "pdfimages imagen embebida (no rasterizar página)", "Chilpancingo texto/mapas"),
    ("foto", "publicar", "purga_automatica_falsa", "SOLO ojos humanos (galeria FLAG, nunca borra)", "es_flyer borró sala-comedor"),
    # VIGILAR — el mundo cambió y la plataforma no
    ("precio", "vigilar", "desactualizado_vs_lista", "lista_peek + lista_apply auto", "Avalia B-204"),
    ("estado", "vigilar", "desactualizado_vs_lista", "lista_peek + lista_apply auto", "Avalia B-204"),
    ("unidad", "vigilar", "desaparecida_de_lista", "lista_apply→vigia_senales_venta", "Único Roma −8"),
    ("proyecto", "vigilar", "renombre_como_nuevo", "vigia.proyecto_renombrado + candado catálogo", "Cordobanes 3"),
    ("archivo", "vigilar", "resubida_como_borrado", "vigia.archivo_reemplazado (md5)", "Panorama 15/15"),
    ("catalogo", "vigilar", "robot_dormido", "auditor.robot_vivo", "laptop cerrada"),
    ("catalogo", "vigilar", "censo_viejo", "censo_norma tras cada ronda", None),
    ("lista", "vigilar", "salud_parcial_como_global", "ultima_auditoria solo-global", "parte decía 0 err"),
    # SIN JUEZ TODAVÍA — deudas honestas (se crean al ser mordidos o al priorizar)
    ("direccion", "leer", "ausente_en_toda_fuente", None, "Único Roma sin dirección"),
    ("nivel", "leer", "no_impreso_en_lista", None, "121 unidades sin piso"),
    ("plano", "leer", "lamina_ilegible_ocr", None, "5 láminas"),
    ("esquema_pago", "interpretar", "pct_inconsistentes_entre_devs", None, "_pct fuera de scope"),
    ("foto", "interpretar", "clasificacion_visual_fina", None, "requiere ojos/IA con crédito"),
]


def resumen() -> Dict[str, Any]:
    total = len(CELDAS)
    cubiertas = sum(1 for c in CELDAS if c[3])
    faltantes = [{"campo": c[0], "etapa": c[1], "modo": c[2], "caso": c[4]}
                 for c in CELDAS if not c[3]]
    return {"total": total, "cubiertas": cubiertas,
            "pct": round(cubiertas * 100 / total, 1),
            "faltantes": faltantes}


def matriz() -> List[Dict[str, Any]]:
    return [{"campo": c[0], "etapa": c[1], "modo": c[2], "juez": c[3], "caso": c[4]}
            for c in CELDAS]
