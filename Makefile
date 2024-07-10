# This file has been generated by @core/node:service-toolchain generator
# It should not be edited manually

# Global porperties

NAMESPACE  ?= pcs
PROJECT    ?= api-stripe
REGISTRY   ?= docker.io/celenaaa
DATE       ?= $(shell date +%Y-%m-%d:%H%M:%s)

# Git

DEFAULT_BRANCH = master

GIT_HASH    ?= $(shell git rev-parse --verify HEAD)
BRANCH_NAME ?= $(shell git rev-parse --abbrev-ref HEAD)

ifeq ($(BRANCH_NAME),$(DEFAULT_BRANCH))
GIT_TAG_NAME ?= $(shell (git describe --abbrev=1 --tags 2>/dev/null || git describe --always) | sed 's/^v\(.*\)$$/\1/')
else
GIT_REV_COUNT  = $(shell git rev-list --count $(DEFAULT_BRANCH)..HEAD)
GIT_SHORT_HASH = $(shell git rev-parse --short HEAD)

GIT_TAG_NAME ?= $(BRANCH_NAME)-$(GIT_REV_COUNT)-$(GIT_SHORT_HASH)
endif

# Docker

REPOSITORY ?= $(NAMESPACE)/$(PROJECT)
IMAGE      ?= $(REGISTRY)/$(PROJECT):$(GIT_TAG_NAME)

BUILDER_IMAGE = node:16
RUNTIME_IMAGE = node:16-slim

PROJECT_ROOT  = /usr/lib/$(REPOSITORY)

# Compose

COMPOSE_FILE ?= test/docker-compose.yml

PROJECT_NAME ?= $(shell echo $(PROJECT) | sed -e 's/-//g')
NETWORK_NAME ?= $(PROJECT_NAME)_backend

COMPOSE_NO_PROXY ?= ipinfos:80

# Docker build

BUILD_LABELS  = --label application_commit=$(GIT_HASH)
BUILD_LABELS += --label application_branch=$(BRANCH_NAME)

BUILD_OPTIONS  = -t $(IMAGE)
BUILD_OPTIONS += $(BUILD_LABELS)
# BUILD_OPTIONS += --network=$(NETWORK_NAME)
BUILD_OPTIONS += --build-arg cache=$(DATE)
BUILD_OPTIONS += --build-arg BUILDER_IMAGE=$(BUILDER_IMAGE)
BUILD_OPTIONS += --build-arg RUNTIME_IMAGE=$(RUNTIME_IMAGE)
BUILD_OPTIONS += --build-arg PROJECT_ROOT=$(PROJECT_ROOT)

ifdef http_proxy
BUILD_OPTIONS += --build-arg http_proxy=$(http_proxy)
endif

ifdef https_proxy
BUILD_OPTIONS += --build-arg https_proxy=$(https_proxy)
endif

BUILD_OPTIONS += --build-arg no_proxy=localhost,0.0.0.0,127.0.0.0/255,$(COMPOSE_NO_PROXY)

# Docker run

ifeq ($(shell tty --silent; echo $$?), 0)
TTY_OPTIONS  = --interactive
TTY_OPTIONS += --tty
TTY_OPTIONS += -e TERM=xterm
endif

RUN_OPTIONS  = --rm
RUN_OPTIONS += --name $(NAMESPACE)-$(PROJECT)
RUN_OPTIONS += -v $(CURDIR):$(PROJECT_ROOT)
RUN_OPTIONS += -w $(PROJECT_ROOT)
RUN_OPTIONS += --network=$(NETWORK_NAME)
RUN_OPTIONS += $(TTY_OPTIONS)

COMMAND ?= npm start

# Targets

default: build

# Compose targets

initialize:
	@echo "> initialize..."
	# docker-compose -f $(COMPOSE_FILE) -p $(PROJECT_NAME) up -d

clean:
	@echo "> clean..."
	# docker-compose -f $(COMPOSE_FILE) -p $(PROJECT_NAME) down --volumes

# Development targets

start: initialize
	@echo "> start..."
	docker run $(RUN_OPTIONS) $(BUILDER_IMAGE) $(COMMAND)

# test: initialize
# 	@echo "> test..."
# 	docker run $(RUN_OPTIONS) $(BUILDER_IMAGE) npm test

# Docker targets

build: initialize
	@echo "> build..."
	docker build $(BUILD_OPTIONS) .

run: initialize
	@echo "> run..."
	docker run --rm --network=$(NETWORK_NAME) $(TTY_OPTIONS) -v $(shell pwd)/config:$(PROJECT_ROOT)/config $(IMAGE) $(COMMAND)

push:
	@echo "> push..."
	docker push $(IMAGE)

# Utils targets

print-%:
	@echo '$($*)'

.PHONY: initialize clean start test build run push
