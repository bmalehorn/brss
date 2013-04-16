TSC=./tsc
TSCFLAGS=--sourcemap --comments
RMFLAGS=-f

COMMON_SOURCES=interfaces.ts
SERVER_SOURCES=server.ts database.ts utilities.ts
STATIC_SOURCES=static/view.ts

SERVER_MAPS=$(SERVER_SOURCES:.ts=.js.map)
SERVER_JS=$(SERVER_SOURCES:.ts=.js)
STATIC_MAPS=$(STATIC_SOURCES:.ts=.js.map)
STATIC_JS=$(STATIC_SOURCES:.ts=.js)
COMMON_MAPS=$(COMMON_SOURCES:.ts=.js.map)
COMMON_JS=$(COMMON_SOURCES:.ts=.js)

all: server.js static/view.js

server.js: $(SERVER_SOURCES) $(COMMON_SOURCES)
	$(TSC) $(TSCFLAGS) server.ts

static/view.js: $(STATIC_SOURCES) $(COMMON_SOURCES)
	$(TSC) $(TSCFLAGS) static/view.ts

clean:
	rm $(RMFLAGS) $(SERVER_MAPS)
	rm $(RMFLAGS) $(SERVER_JS)
	rm $(RMFLAGS) $(STATIC_MAPS)
	rm $(RMFLAGS) $(STATIC_JS)
	rm $(RMFLAGS) $(COMMON_MAPS)
	rm $(RMFLAGS) $(COMMON_JS)
