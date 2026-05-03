from typing import cast

import pytest

from doclatticeserver.tests.factories import UserFactory
from doclatticeserver.users.models import User


@pytest.fixture(autouse=True)
def media_storage(settings, tmpdir):
    settings.MEDIA_ROOT = tmpdir.strpath


@pytest.fixture
def user() -> User:
    return cast(User, UserFactory())
