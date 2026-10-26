# Actividad académica: Árboles en un sistema de archivos jerárquico

**Asignatura:** Estructuras de Datos  
**Tema:** Árboles n-arios (árboles generales)  
**Caso de estudio:** Administrador jerárquico de archivos y directorios  
**Implementación:** Python 3.9 o superior

## 1. Selección y justificación del caso de estudio

Un sistema de archivos organiza directorios y archivos en niveles. Cada elemento, salvo la raíz, pertenece a un único directorio padre; un directorio puede contener varios archivos y subdirectorios. Esta relación se representa de forma natural con un árbol n-ario: cada nodo puede tener cero o más hijos y la cantidad de hijos no está limitada a dos.

El árbol es indispensable para conservar la semántica jerárquica y resolver operaciones que dependen de ella. Una lista o una cola podría guardar todos los elementos en secuencia, pero no expresa directamente el vínculo padre-hijo. Para recorrer una ruta habría que buscar y filtrar elementos, reconstruir relaciones por separado y evitar que una operación sobre una carpeta pierda la agrupación de su subárbol. El árbol mantiene estas relaciones en la propia estructura.

Una tabla hash es apropiada para localizar una clave exacta, pero por sí sola tampoco modela la jerarquía. Puede complementar al árbol como índice de rutas absolutas, aunque las relaciones entre directorios, la navegación por componentes de ruta y el recorrido de subárboles todavía requieren una estructura jerárquica. En esta implementación los hijos se guardan en listas; por ello, localizar un hijo entre sus hermanos requiere una búsqueda lineal.

El árbol permite navegar `/home/alex/documents/report.pdf` descendiendo desde la raíz por cada componente de la ruta. También permite eliminar una carpeta desvinculando su raíz y, con ello, todo su subárbol. Para calcular el almacenamiento agregado de una carpeta, se visitan sus descendientes y se suman los tamaños de los archivos. El resultado de un directorio depende de sus hijos y se obtiene mediante una agregación de abajo hacia arriba.

## 2. Modelado y arquitectura

### Componentes

- **Raíz (`/`):** directorio único que inicia la jerarquía y no tiene padre.
- **Nodos internos:** carpetas que tienen uno o más hijos. En este modelo un directorio vacío también puede ser una hoja estructural.
- **Nodos hoja:** archivos sin hijos. Los directorios vacíos también son hojas en el sentido estructural de no tener descendientes.
- **Relaciones:** cada nodo no raíz tiene una referencia al padre; cada directorio conserva una lista de hijos. Los archivos no pueden tener hijos.
- **Tamaño:** los archivos almacenan su tamaño base en bytes. Los directorios tienen tamaño base cero y su tamaño total es la suma recursiva de los archivos descendientes.

La distinción entre peso y tamaño evita ambigüedades: el **peso de un árbol**, en la terminología de estructuras de datos, es la cantidad de nodos; el **tamaño de almacenamiento** calculado aquí es una cantidad de bytes. La altura es la longitud del camino más largo desde la raíz a una hoja. Si se cuenta la raíz en el nivel 1, el nivel de un nodo corresponde a su distancia desde la raíz más uno.

### Diagrama conceptual

```text
/
├── home/
│   └── alex/
│       ├── documents/
│       │   ├── report.pdf (2 MiB)
│       │   └── notes.txt (12 KiB)
│       ├── projects/
│       │   └── tree_lab/
│       │       ├── main.py (8 KiB)
│       │       └── data/
│       │           └── sample.csv (256 KiB)
│       └── downloads/
│           └── archive.zip (5 MiB)
└── var/
    └── log/
        └── system.log (640 KiB)
```

Los directorios intermedios que falten se crean durante `insert`. La ruta debe ser absoluta y de estilo POSIX. No se admiten componentes `.` o `..`, ya que resolverlos cambiaría la interpretación explícita de la ruta.

## 3. Implementación en Python

El archivo [`filesystem_tree.py`](filesystem_tree.py) contiene las clases `FileSystemNode` y `FileSystemTree`, excepciones específicas y un programa de demostración interactivo. Todo el código, incluidos identificadores, comentarios y docstrings, está en inglés.

### Operaciones y contratos

1. **`insert(path, is_directory, size=0)`** crea un archivo o directorio. Crea automáticamente los directorios ancestros ausentes y rechaza rutas duplicadas, tamaños negativos, tamaños de directorio distintos de cero y cualquier intento de atravesar un archivo.
2. **`search(path)`** devuelve el nodo exacto o lanza una excepción específica si la ruta no existe o un componente intermedio es un archivo.
3. **`calculate_total_size(node)`** calcula recursivamente los bytes de los archivos contenidos en el subárbol. El caso base de un archivo es su propio tamaño; para un directorio se suman los resultados de sus hijos.
4. **`display_tree(node=None, level=0)`** presenta el árbol con indentación y tamaños agregados de directorios.
5. **`delete(path)`** impide borrar la raíz, elimina la referencia del nodo en su padre y establece el padre del nodo eliminado en `None`. Los vínculos internos del subárbol se conservan en el objeto retornado, pero este deja de pertenecer al árbol principal.

Las excepciones `DuplicatePathError`, `PathNotFoundError`, `NotDirectoryError` e `InvalidPathError` hacen explícitos los errores de dominio. Todas heredan de `FileSystemError`, por lo que el cliente puede capturar errores específicos o agruparlos.

### Ejecución

Desde este directorio, ejecute:

```bash
python filesystem_tree.py
```

El programa construye una jerarquía con carpetas, archivos de distintos tamaños en KiB/MiB, imprime el árbol, calcula totales para directorios superiores, solicita una ruta de búsqueda y permite borrar una ruta opcional. Las unidades KiB y MiB usan múltiplos de 1024; el almacenamiento interno se expresa en bytes.

## 4. Recorridos y complejidad algorítmica

Sea `n` la cantidad de nodos del árbol, `h` la cantidad de componentes de la ruta (y, por tanto, una cota de su profundidad), `d_i` el número de hijos examinados en el nivel `i`, `d̄` el grado promedio de los directorios visitados y `s` la cantidad de nodos del subárbol analizado. La tabla considera que los hijos se buscan en listas sin índice hash. El caso promedio supone que el componente buscado se distribuye aproximadamente de manera uniforme entre los hijos.

| Operación | Recorrido o estrategia | Mejor caso | Caso promedio | Peor caso | Espacio auxiliar |
|---|---|---:|---:|---:|---:|
| `insert` | Descenso dirigido por componentes de ruta; crea ancestros ausentes | O(h) | O(h · d̄) | O(n + h), acotado por O(n) para un árbol no vacío | O(h) por los componentes de ruta y los nodos nuevos |
| `search` | Búsqueda dirigida desde la raíz; inspección lineal de los hermanos de cada nivel | O(h) | O(h · d̄) | O(n) | O(h) por los componentes de ruta |
| `calculate_total_size` | DFS en postorden: procesa archivos y agrega resultados al regresar a cada directorio | O(1) si el nodo es un archivo | O(s) | O(s) | O(h) por la pila recursiva |
| `delete` | Búsqueda dirigida, seguida de desvinculación del hijo en su padre | O(h) | O(h · d̄ + d̄) | O(n) | O(h) por los componentes de ruta |

El mejor caso de `insert` ocurre cuando cada directorio visitado tiene que examinar pocos hijos o cuando los componentes ya existentes aparecen al inicio de cada lista; la creación de una ruta nueva de longitud `h` requiere espacio proporcional a los nodos agregados. En promedio, cada nivel puede examinar una fracción de sus hijos. En el peor caso, una carpeta muy ancha obliga a revisar casi toda su lista de hijos; la suma de los grados revisados en un recorrido dirigido queda acotada por el número de nodos del árbol. La complejidad de `delete` incluye el costo lineal de retirar el nodo de la lista de su padre.

El cálculo de tamaño visita cada nodo del subárbol una vez, así que es lineal en `s`, con profundidad de pila proporcional a la altura. La visualización también recorre cada nodo del subárbol una vez: O(s) tiempo y O(h) espacio de llamadas recursivas, sin contar las líneas impresas.

En un árbol general no existe un recorrido **in-order** canónico: ese orden se define de forma natural para árboles binarios. Para inserción y búsqueda, una búsqueda en profundidad exhaustiva sería innecesaria porque la ruta indica el hijo que debe seguirse en cada nivel. Una búsqueda en anchura tampoco aporta ventaja para rutas absolutas; sería útil, por ejemplo, para enumerar elementos por nivel. Para borrar, se reutiliza la búsqueda dirigida y luego se elimina el enlace padre-hijo. El recorrido en preorden para visualización muestra cada directorio antes que sus descendientes, una disposición legible para una jerarquía. El postorden para tamaño permite sumar los tamaños de los hijos antes de obtener el agregado del padre.

## 5. Conclusiones técnicas

1. **La estructura refleja el dominio.** El árbol n-ario representa directamente padres, hijos, hermanos y subárboles, lo que simplifica navegación, presentación y eliminación de directorios completos. El costo de esa claridad es que las búsquedas de hermanos en la lista son lineales con el grado del directorio.
2. **El costo depende tanto de la profundidad como del ancho.** La navegación por una ruta visita sus niveles, pero en cada uno debe buscar linealmente entre los hijos. La agregación de almacenamiento y la visualización son lineales respecto a los nodos del subárbol recorrido. Para cargas con directorios muy anchos, un índice por nombre en cada directorio puede reducir la búsqueda local.
3. **La solución puede escalar con índices y metadatos mantenidos.** Un mapa hash complementario de rutas absolutas a nodos permitiría búsquedas exactas promedio O(1), a cambio de memoria adicional y de actualizar el índice en inserciones, eliminaciones y movimientos. Para árboles muy profundos convendría sustituir la recursión por pilas explícitas; también se podrían mantener tamaños agregados en los ancestros tras cada cambio, ponderando la rapidez de consulta frente al costo de actualización.

## Referencia de clase

Conceptos introductorios de jerarquía, nodos, raíz, hojas, altura, nivel, peso y árboles n-arios: material de clase **Arboles.pdf**, fechado el 26 de octubre de 2026. El caso de estudio, el análisis y el programa de esta actividad se desarrollan para este entregable.
