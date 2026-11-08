from pydantic import BaseModel, Field

from src.core.document_limits import MONEY_LIMIT


class TcsInput(BaseModel):
    tcs_section_id: int | None = Field(default=None, gt=0)
    # None requests the suggestion; zero is an explicit decision not to collect.
    tcs_amount: float | None = Field(default=None, ge=0, lt=MONEY_LIMIT, allow_inf_nan=False)


class TcsOut(BaseModel):
    tcs_section_id: int | None = None
    tcs_section_ref: str | None = None
    tcs_base: str | None = None
    tcs_rate: float = 0
    tcs_base_amount: float = 0
    tcs_amount: float = 0
    ledger_pan: str | None = None
