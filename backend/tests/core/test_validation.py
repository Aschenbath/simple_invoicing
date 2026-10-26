import pytest
from src.core.validation import normalize_gstin, normalize_hsn_sac, is_gst_rate_slab


def test_normalize_gstin_valid():
    result = normalize_gstin("  27abcde1234f1z5  ")
    assert result == "27ABCDE1234F1Z5"


def test_normalize_gstin_none():
    assert normalize_gstin(None) is None


def test_normalize_gstin_blank():
    assert normalize_gstin("   ") is None
    assert normalize_gstin("") is None


def test_normalize_gstin_invalid_length():
    with pytest.raises(ValueError, match="Invalid GSTIN format"):
        normalize_gstin("27ABCDE1234F1Z")


def test_normalize_gstin_bad_14th_character():
    # 14th character must be Z
    with pytest.raises(ValueError, match="Invalid GSTIN format"):
        normalize_gstin("27ABCDE1234F1A5")


def test_normalize_hsn_sac_valid_4():
    assert normalize_hsn_sac("1234") == "1234"


def test_normalize_hsn_sac_valid_6():
    assert normalize_hsn_sac("  123456  ") == "123456"


def test_normalize_hsn_sac_valid_8():
    assert normalize_hsn_sac("12345678") == "12345678"


def test_normalize_hsn_sac_none():
    assert normalize_hsn_sac(None) is None


def test_normalize_hsn_sac_blank():
    assert normalize_hsn_sac("   ") is None
    assert normalize_hsn_sac("") is None


def test_normalize_hsn_sac_invalid_5_digits():
    with pytest.raises(ValueError, match="HSN/SAC must be 4, 6 or 8 digits"):
        normalize_hsn_sac("12345")


def test_normalize_hsn_sac_invalid_7_digits():
    with pytest.raises(ValueError, match="HSN/SAC must be 4, 6 or 8 digits"):
        normalize_hsn_sac("1234567")


def test_normalize_hsn_sac_letters():
    with pytest.raises(ValueError, match="HSN/SAC must be 4, 6 or 8 digits"):
        normalize_hsn_sac("ABCD")


def test_is_gst_rate_slab_accepted():
    for slab in (0.0, 0.1, 0.25, 1.0, 1.5, 3.0, 5.0, 6.0, 7.5, 12.0, 18.0, 28.0):
        assert is_gst_rate_slab(slab) is True
        assert is_gst_rate_slab(float(slab)) is True


def test_is_gst_rate_slab_rejected():
    assert is_gst_rate_slab(17.99) is False
    assert is_gst_rate_slab(None) is False
    assert is_gst_rate_slab(2.0) is False
    assert is_gst_rate_slab(100.0) is False
