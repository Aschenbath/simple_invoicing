from src.services.pdf_templates.builders import _e, _fmt_currency


def tcs_label(document):
    rate = float(getattr(document, "tcs_rate", 0) or 0)
    return f"TCS @ {rate:g}% (s.{getattr(document, 'tcs_section_ref', '')})"


def tcs_html(document, currency):
    if not getattr(document, "tcs_section_id", None):
        return ""
    return f'<p>{_e(tcs_label(document))}: {_fmt_currency(float(document.tcs_amount or 0), currency)}</p>'


def credit_tcs_html(document, currency):
    result = ""
    if getattr(document, "tcs_amount", 0):
        result += f'<p>TCS reversed: {_fmt_currency(float(document.tcs_amount), currency)}</p>'
    if getattr(document, "invoice_adjustment_amount", 0):
        result += f'<p>Invoice discount / round off: {_fmt_currency(float(document.invoice_adjustment_amount), currency)}</p>'
    return result
