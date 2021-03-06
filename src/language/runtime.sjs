// # module: runtime
//
// Provides the base runtime.

// -- Dependencies -----------------------------------------------------
var c     = require('core.check');
var show  = require('core.inspect');
var Maybe = require('data.maybe');
var equal = require('deep-equal');
var { curry }       = require('core.lambda');
var { Base }        = require('boo');
var { List, Value } = require('./data');
var { eval }        = require('./eval');

var { Applicative, Symbol, Lambda, Tagged, Raw } = Value;


// -- Helpers ----------------------------------------------------------

// ### function: assert
// @private
// @type: Validation[Violation, α] → α :: throws
function assert(val) {
  val.cata({
    Failure: λ(a) -> { throw new Error('Expected ' + show(a)) },
    Success: λ[#]
  })
}

// ### function: raise
// @private
// @type: Error -> Void :: throws
function raise(e) {
  throw e;
}

// ### function: unbox
// @private
// @type: String -> Tagged -> Any :: throws
unbox = curry(2, unbox);
function unbox(tag, val) {
  assert(tag(val));
  return val
}

var str = unbox(c.String);
var num = unbox(c.Number);
var bool = unbox(c.Boolean);

function meta(key, value) {
  return Tagged(Symbol('meta'), { key: key, value: value })
}

function makeDeclaration(data, kind, parser) {
    c.assert(c.String(data.signature));
    c.assert(c.Array(data.children));

    return Tagged(Symbol('declaration'),
                  {
                    kind: kind,
                    meta: parser(data.signature),
                    children: data.children
                  })
}

function parseFnSignature(sig) {
  var m = sig.match(/(.+?)(\(.*?\))/);
  return m == null?       { name: sig, signature: sig }
  :      /* otherwise */  { name: m[1], signature: sig }
}

function parseClassSignature(sig) {
  var m = sig.match(/(.+?)(\(.*?\))(?:\s*<\s*(.+))?/);
  return m == null?       { name: sig, signature: sig }
  :      /* otherwise */  { name: m[1],
                            signature: m[1] + m[2],
                            parents: m[3] }
}


// -- Core environment -------------------------------------------------
var Env = module.exports = Base.derive({
  // -- Core operations ------------------------------------------------
  tag:
  Applicative(['tag', 'value'], function(data) {
    return Tagged(data.tag, data.value)
  }),

  meta:
  Applicative(['key', 'value'], function(data) {
    return meta(data.key, data.value)
  }),

  // --- Boolean operations --------------------------------------------
  not:
  Applicative(['value'], function(data) {
    return match data.value {
      false => true,
      []    => true,
      *     => false
    }
  }),

  'boolean?':
  Applicative(['value'], function(data) {
    return data.value === true || data.value === false
  }),

  // --- Numeric operations --------------------------------------------
  '+':
  Applicative(['left', 'right'], function(data) {
    return num(data.left) + num(data.right)
  }),

  '-':
  Applicative(['left', 'right'], function(data) {
    return num(data.left) + num(data.right)
  }),

  '*':
  Applicative(['left', 'right'], function(data) {
    return num(data.left) * num(data.right)
  }),

  '/':
  Applicative(['left', 'right'], function(data) {
    return num(data.left) / num(data.right)
  }),

  // --- Comparison operations -----------------------------------------
  '=':
  Applicative(['left', 'right'], function(data) {
    return equal(data.left, data.right)
  }),
  
  '<':
  Applicative(['left', 'right'], function(data) {
    return num(data.left) < num(data.right)
  }),

  '<=':
  Applicative(['left', 'right'], function(data) {
    return num(data.left) <= num(data.right)
  }),

  '>':
  Applicative(['left', 'right'], function(data) {
    return num(data.left) > num(data.right)
  }),

  '>=':
  Applicative(['left', 'right'], function(data) {
    return num(data.left) >= num(data.right)
  }),

  
  // --- Symbol operations ---------------------------------------------
  name:
  Applicative(['value'], function(data) {
    return match data.value {
      Symbol(a) => a,
      a         => raise(new TypeError('Not a symbol: ' + show(a)))
    }
  }),

  
  // -- Vector operations ----------------------------------------------
  first:
  Applicative(['value'], function(data) {
    assert(c.Array(data.value));
    return data.value.length > 0?  data.value[0]
    :      /* otherwise */         []
  }),

  last:
  Applicative(['value'], function(data) {
    assert(c.Array(data.value));
    return data.value.length > 0?  data.value[data.value.length - 1]
    :      /* otherwise */         []
  }),

  nth:
  Applicative(['value', 'index'], function(data) {
    assert(c.Array(data.value));
    var i = num(data.index);
    if (i > data.value.length - 1) {
      throw new RangeError('Index out of bounds: ' + i);
    } else {
      return data.value[i]
    }
  }),

  // -- Text -----------------------------------------------------------
  raw:
  Applicative(['format', 'block'], function(data) {
    c.assert(c.String(data.block))
    c.assert(c.String(data.format))

    return Raw(data.format, data.block)
  }),

  paragraph:
  Applicative(['value'], function(data) {
    return Tagged(Symbol('paragraph'), data.value)
  }),

  text:
  Applicative(['value'], function(data) {
    return Tagged(Symbol('text'), data.value)
  }),

  bold:
  Applicative(['value'], function(data) {
    return Tagged(Symbol('bold'), data.value)
  }),

  italic:
  Applicative(['value'], function(data) {
    return Tagged(Symbol('italic'), data.value)
  }),

  'soft-break':
  Applicative(['value'], function(data) {
    return Tagged(Symbol('soft-break'), data.value)
  }),

  line:
  Applicative(['value'], function(data) {
    return Tagged(Symbol('line'), data.value)
  }),
  
  declaration:
  Applicative(['kind', 'children'], function(data) {
    c.assert(c.String(data.kind));
    c.assert(c.Array(data.children));
    
    return Tagged(Symbol('declaration'),
                  { kind: data.kind,
                    meta: {},
                    children: data.children })
  }),

  section:
  Applicative(['title', 'children'], function(data) {
    c.assert(c.String(data.title));
    c.assert(c.Array(data.children));
    
    return Tagged(Symbol('section'),
                  { title: data.title,
                    meta: {},
                    children: data.children })
  }),

  // Common declarations
  'function':
  Applicative(['signature', 'children'], function(data) {
    return makeDeclaration(data, 'function', parseFnSignature)
  }),

  'method':
  Applicative(['signature', 'children'], function(data) {
    return makeDeclaration(data, 'method', parseFnSignature)
  }),

  'classmethod':
  Applicative(['signature', 'children'], function(data) {
    return makeDeclaration(data, 'classmethod', parseFnSignature)
  }),

  'class':
  Applicative(['signature', 'children'], function(data) {
    return makeDeclaration(data, 'class', parseClassSignature)
  }),

  code:
  Applicative(['language', 'block'], function(data) {
    c.assert(c.String(data.block));
    c.assert(c.String(data.language));
    
    return Tagged(Symbol('code'),
                  { language: data.language,
                    code: data.block })
  }),

  example:
  Applicative(['language', 'block', 'line-numbers', 'emphasise-lines', 'caption'], function(data) {
    c.assert(c.String(data.block));
    c.assert(c.String(data.language));

    return Tagged(Symbol('example'),
                  {
                    language: data.language,
                    code: data.block,
                    options: {
                      'line-numbers': data.lineNumbers !== false,
                      'emphasise-lines': data['emphasise-lines'],
                      caption: data.caption || 'Example'
                    }
                  })
  }),

  list:
  Applicative(['items'], function(data) {
    c.assert(c.Array(data.items));
    
    return Tagged(Symbol('list'), data.items)
  }),

  'ordered-list':
  Applicative(['items'], function(data) {
    c.assert(c.Array(data.items));

    return Tagged(Symbol('ordered-list'), data.items)
  }),

  'private':
  Applicative([], function(){
    return meta('private', true)
  }),

  'public':
  Applicative([], function() {
    return meta('public', true)
  }),

  name:
  Applicative(['block'], function(data) {
    c.assert(c.String(data.block));

    return meta('name', data.block);
  }),

  type:
  Applicative(['block'], function(data) {
    c.assert(c.String(data.block));
    
    return meta('type', data.block)
  }),

  stability:
  Applicative(['block'], function(data) {
    var v = data.block.toLowerCase();
    var allowed = c.Or([
      c.Value('deprecated'),
      c.Value('experimental'),
      c.Value('unstable'),
      c.Value('stable'),
      c.Value('frozen'),
      c.Value('locked')
    ]);
    c.assert(allowed(v));

    return meta('stability', v)
  }),

  portability:
  Applicative(['block'], function(data) {
    c.assert(c.String(data.block));
    
    return meta('portability', data.block)
  }),

  synopsis:
  Applicative(['block'], function(data) {
    c.assert(c.String(data.block));
    
    return meta('synopsis', data.block)
  }),

  platform:
  Applicative(['block'], function(data) {
    c.assert(c.String(data.block));

    return meta('platform', data.block)
  }),

  returns:
  Applicative(['block'], function(data) {
    c.assert(c.String(data.block));

    return meta('returns', data.block)
  }),

  'throws':
  Applicative(['name', 'block'], function(data) {
    c.assert(c.String(data.block));

    return meta('throws', { description: data.block,
                            name: data.name })
  }),

  signature:
  Applicative(['block'], function(data) {
    c.assert(c.String(data.block));

    return meta('signature', data.block)
  }),

  literal:
  Applicative(['block'], function(data) {
    c.assert(c.String(data.block));

    return Tagged(Symbol('literal'), data.block);
  }),

  link:
  Applicative(['text', 'url'], function(data) {
    return Tagged(Symbol('link'), { url: data.url, text: data.text })
  }),

  ref:
  Applicative(['id', 'block'], function(data) {
    c.assert(c.String(data.id));
    c.assert(c.String(data.block));

    return Tagged(Symbol('ref'), { id: data.id, url: data.block })
  }),

  note:
  Applicative(['block'], function(data) {
    c.assert(c.String(data.block));

    return Tagged(Symbol('note'), { kind: 'note', text: data.block })
  }),

  warning:
  Applicative(['block'], function(data) {
    c.assert(c.String(data.block));

    return Tagged(Symbol('note'), { kind: 'warning', text: data.block })
  }),

  'version-added':
  Applicative(['version', 'block'], function(data) {
    c.assert(c.String(data.version));

    return Tagged(Symbol('version-note'), { kind: 'added',
                                            version: data.version,
                                            text: data.block || '' })
  }),

  'version-changed':
  Applicative(['version', 'block'], function(data) {
    c.assert(c.String(data.version));

    return Tagged(Symbol('version-note'), { kind: 'changed',
                                            version: data.version,
                                            text: data.block || '' })
  }),

  'deprecated':
  Applicative(['version', 'block'], function(data) {
    c.assert(c.String(data.version));

    return Tagged(Symbol('version-note'), { kind: 'deprecated',
                                            version: data.version,
                                            text: data.block || '' })
  })
})

