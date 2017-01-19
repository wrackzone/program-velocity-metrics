/** this class is configured with { series : [] } where series is a single dimensional array of 
    data values that is filled to full extent of the date range with future values filled with 
    nulls.
**/
Ext.define("RallyFunctions", function() {

    var self;

    return {
        config : {
            ctx : {},
            filter : null,
            featureFilter : null,
            keys : [],
            fns : {}
        },

        constructor:function(config) {
            self = this;
            this.initConfig(config);
            self.fns['scheduleStates'] = self._readStates
            self.fns['peValues']   = self._loadPreliminaryEstimateValues
            self.fns['releases']   = self._loadReleases
            self.fns['iterations'] = self._loadIterations
            self.fns['projects']   = self._loadProjects
            self.fns['projectReleases'] = self._loadProjectReleases
            self.fns['piTypes']    = self._loadPortfolioItemTypes
            return this;
        },

        readRallyItems : function(callback) {

            var fns = [self._initBundle];
            _.each(self.keys,function(key) {
                if (_.contains(_.keys(self.fns),key))
                    fns.push(self.fns[key])
            });

            Deft.Chain.pipeline(fns,self).then({
                success: function(bundle) {
                    callback( null, bundle);
                },
                failure: function(error) {
                    //oh noes!
                    console.log("Error:",error);
                    callback(error,null);
                }
            });
        },

        readProjectWorkItems : function(callback) {

            console.log('readProjectWorkItems', self.featureFilter);
            
            var fns = [
                self.readStates,
                self.readProjects,
                self.readStories
            ];

            if (self.featureFilter!==null) {
                fns = [
                    self.readStates,
                    self.readProjects,
                    self.readFeatures
                ];
            }

            Deft.Chain.pipeline(fns,self).then({
                success: function(workItems) {
                    callback( null, workItems, self.projects, self.scheduleStates);
                },
                failure: function(error) {
                    //oh noes!
                    console.log("Error:",error);
                }
            });
        },

        _initBundle :  function() {
            console.log("_initBundle");
            var deferred = Ext.create('Deft.Deferred');
            deferred.resolve({});
            return deferred.promise;
        },

        _readStates : function(bundle) {
            var that = this;
            var deferred = Ext.create('Deft.Deferred');

            Rally.data.ModelFactory.getModel({
                type: 'UserStory',
                success: function(model) {
                    model.getField('ScheduleState').getAllowedValueStore().load({
                        callback: function(records, operation, success) {
                            var scheduleStates = _.map(records,function(r){ return r.get("StringValue");});
                            deferred.resolve({scheduleStates:scheduleStates});
                        }
                    });
                }
            });
            return deferred.promise;
        },

        _loadPreliminaryEstimateValues : function(bundle) {
            var that = this;
            console.log("_loadPreliminaryEstimateValues");
            var deferred = Ext.create('Deft.Deferred');

            that._loadAStoreWithAPromise( 
                'PreliminaryEstimate',
                true,
                []).then({
                    success : function(records) {
                        bundle["preliminaryEstimateValues"] = records;
                        deferred.resolve(bundle);
                    }
                });
            return deferred.promise;
        },  

        _loadReleases : function(bundle) {
            var that = this;
            console.log("_loadReleases");
            var deferred = Ext.create('Deft.Deferred');
            that._loadAStoreWithAPromise( 
                'Release',
                true,
                [],
                {
                    projectScopeDown : false
                },
                "ReleaseDate").then({
                    success : function(records) {
                        bundle["releases"] = records;
                        deferred.resolve(bundle);
                    }
                });
            return deferred.promise;
        },  

        _loadIterations : function(bundle) {
            var that = this;
            console.log("_loadIterations");
            var deferred = Ext.create('Deft.Deferred');
            that._loadAStoreWithAPromise( 
                'Iteration',
                true,
                [],
                {
                    projectScopeDown : false
                },
                "IterationEndDate").then({
                    success : function(records) {
                        bundle["iterations"] = records;
                        deferred.resolve(bundle);
                    }
                });
            return deferred.promise;
        },  

        _loadProjectReleases : function(bundle) {
            console.log("_loadProjectReleases");
            var that = this;
            var deferred = Ext.create('Deft.Deferred');
            that._loadProjects(bundle).then({
                success: function(bundle) {
                    // read releases for each project returned.
                    Deft.Promise.map( bundle.projects,function(project) {
                    // Deft.Chain.sequence( bundle.projects,function(project) {
                        var deferred = Ext.create('Deft.Deferred');
                        // model_name, model_fields, filters,ctx,order
                        self._loadAStoreWithAPromise('Release',
                            true,
                            [{property:"ReleaseDate",operator:">",value:self.getLastYearDate()},
                             {property:"ReleaseDate",operator:"<=",value:self.getToday()}
                            ],
                            {
                                project : project.get("_ref"),
                                projectScopeDown : true
                            }
                        ).then({
                            success: function(records) {
                                deferred.resolve(records);
                            }
                        })
                        return deferred.promise;
                    }).then({
                        success : function(projectReleases) {
                            var prs = _.map(bundle.projects,function(project,i){
                                // console.log("context",self.ctx.getProject(),project.get("ObjectID"));
                                return {
                                    project : project,
                                    parent : self.ctx.getProject().ObjectID == project.get("ObjectID"),
                                    releases : self._groupReleases(projectReleases[i])
                                };
                            });
                            prs = _.sortBy( prs,function(pr) {
                                return pr.project.get("Name");
                            })
                            bundle.projectReleases = _.sortBy( prs,function(pr) {
                                return !(pr.parent);
                            })
                            deferred.resolve(bundle);
                        }
                    })
                }
            })
            return deferred.promise;

        },

        _groupReleases : function(releases) {
            // groups the set of release objects by name, sorts by release date
            // a logical release is the release name, dates and set of release objects.
            var groupedReleases = _.groupBy(releases,function(release) {
                return release.get("Name");
            });

            var logicalReleases = _.map( _.keys(groupedReleases), function(key) {
                var releases = groupedReleases[key];
                return {
                    name : _.first(releases).get("Name"),
                    releaseDate : _.first(releases).get("ReleaseDate"),
                    releaseStartDate : _.first(releases).get("ReleaseStartDate"),
                    releases : releases
                }              
            });
            return _.sortBy(logicalReleases,function(r){
                return r.releaseDate;
            })
        },

        _loadProjects : function(bundle) {
            // reads the set of immediate child projects from the ctx project
            var that = this;
            var deferred = Ext.create('Deft.Deferred');
            var fetch = ["ObjectID","Name","_ref","Parent","State","Parent","Children"];
            console.log("_loadProjects");
            self._loadAStoreWithAPromise('Project', 
                fetch, 
                [
                    {property : "ObjectID" , operator : "=", value : self.ctx.getProject().ObjectID }
                ]).then({
                    scope: that,
                    success: function(projects) {
                        if ( _.first(projects).get('Children').Count === 0 ) {
                            bundle.projects = projects;
                            deferred.resolve(bundle);
                        } else {
                            _.first(projects).getCollection('Children').load({
                                fetch : fetch,
                                callback: function(records, operation, success) {
                                    bundle.projects = _.filter(records,function(r) { return r.get("State")!=="Closed"; });
                                    bundle.projects.unshift(_.first(projects));
                                    deferred.resolve(bundle);
                                }
                            });
                        }
                    }
            });
            return deferred.promise;
        },

        _loadPortfolioItemTypes : function(bundle) {
            console.log("_loadPortfolioItemTypes");
            var deferred = Ext.create('Deft.Deferred');

            self._loadAStoreWithAPromise( 
                'TypeDefinition',
                true,
                [
                    { 
                        property:"Ordinal", operator:"!=", value:-1
                    } 
                ]).then(
                {
                    success : function(records) {
                        bundle["piTypes"] = records;
                        deferred.resolve(bundle);
                    }
                })

            return deferred.promise;
        },

        readProjects : function(states) {

            var deferred = Ext.create('Deft.Deferred');
            var me = this;

            self._loadAStoreWithAPromise('Project', 
                ["_ref","Parent","Children"], 
                [
                    {property : "ObjectID" , operator : "=", value : self.ctx.getProject().ObjectID }
                ]).then({
                    scope: me,
                    success: function(projects) {
                        if ( _.first(projects).get('Children').Count === 0 ) {
                            self.projects = projects;
                            deferred.resolve(self.projects);
                        } else {
                            _.first(projects).getCollection('Children').load({
                                fetch : ["ObjectID","Name","_ref","Parent","State"],
                                callback: function(records, operation, success) {
                                    self.projects = _.filter(records,function(r) { return r.get("State")!=="Closed"; });
                                    self.projects.push(_.first(projects));
                                    console.log("self.projects",self.projects,projects);
                                    deferred.resolve(self.projects);
                                }
                            });
                        }
                    }
            });
            return deferred.promise;
        },    

        readStories : function(projects) {
            console.log('readStories', projects, self.filter);
            var me = this;

            var promises = _.map(projects,function(project) {
                var deferred = Ext.create('Deft.Deferred');
                self._loadAStoreWithAPromise(
                    'HierarchicalRequirement', 
                    ["ObjectID","ScheduleState","PlanEstimate","Project"], 
                    [self.filter],
                    {   project: project.get("_ref"),
                        projectScopeUp: false,
                        projectScopeDown: true
                    }).then({
                    scope: me,
                    success: function(stories) {
                        console.log('stories',stories);
                        deferred.resolve(stories);
                    }
                });
                return deferred.promise;
            });

            return Deft.Promise.all(promises);

        },

        readFeatures : function(projects) {

            var me = this;

            var readFeatureType = function() {
                var deferred = Ext.create('Deft.Deferred');
                self._loadAStoreWithAPromise(
                    'TypeDefinition', 
                    ["TypePath"], 
                    [ { property:"Ordinal", operator:"=", value:0} ]
                    ).then({
                    scope: me,
                    success: function(types) {
                        deferred.resolve(_.first(types).get("TypePath"));
                    }
                });
                return deferred.promise;
            };

            var readFeatures = function(type) {

                var promises = _.map(projects,function(project) {
                    var deferred = Ext.create('Deft.Deferred');
                    self._loadAStoreWithAPromise(
                        type, 
                        ["FormattedID","Name","ObjectID","LeafStoryCount","LeafStoryPlanEstimateTotal",
                        "PreliminaryEstimate", "AcceptedLeafStoryCount", "AcceptedLeafStoryPlanEstimateTotal",
                        "PercentDoneByStoryCount","c_ValueMetricKPI","Rank","State"],
                        [self.featureFilter],
                        {   project: project.get("_ref"),
                            projectScopeUp: false,
                            projectScopeDown: true
                        },
                        [ { property : 'DragAndDropRank', direction : 'ASC' } ]).then({
                        scope: me,
                        success: function(stories) {
                            deferred.resolve(stories);
                        }
                    });
                    return deferred.promise;
                });

                return Deft.Promise.all(promises);
            };

            var deferred = Ext.create('Deft.Deferred');
            Deft.Chain.pipeline([readFeatureType,readFeatures],self).then({
                success: function(results) {
                    deferred.resolve(results);
                }
            });
            return deferred.promise;

        },

        readPreferenceValues : function(keys) {

            var me = this;

            var promises = _.map(keys,function(key) {
                var deferred = Ext.create('Deft.Deferred');
                self._loadAStoreWithAPromise(
                        "Preference", 
                        ["Name","Value"], 
                        [{ property : "Name", operator : "=", value : key }]
                    ).then({
                        scope: me,
                        success: function(values) {
                            deferred.resolve(values);
                        },
                        failure: function(error) {
                            deferred.resolve("");
                        }
                    });
                return deferred.promise;
            });
            return Deft.Promise.all(promises);
        },

        _loadAStoreWithAPromise: function(model_name, model_fields, filters,ctx,order){
            var deferred = Ext.create('Deft.Deferred');
            var me = this;
              
            var config = {
                model: model_name,
                fetch: model_fields,
                filters: filters,
                limit: 'Infinity'
            };
            if (!_.isUndefined(ctx)&&!_.isNull(ctx)) {
                config.context = ctx;
            }
            if (!_.isUndefined(order)&&!_.isNull(order)) {
                config.order = order;
            }

            Ext.create('Rally.data.wsapi.Store', config ).load({
                callback : function(records, operation, successful) {
                    if (successful){
                        deferred.resolve(records);
                    } else {
                        deferred.reject('Problem loading: ' + operation.error.errors.join('. '));
                    }
                }
            });
            return deferred.promise;
        },

        getLastYearDate : function() {
            var date = new Date();
            date.setFullYear( date.getFullYear() - 1 );
            return Rally.util.DateTime.toIsoString(date, false);
        },
        getToday : function() {
            var date = new Date();
            return Rally.util.DateTime.toIsoString(date, false);
        },

        recurseObject : function( obj, callback ) {

        var deferred = Ext.create('Deft.Deferred');
        var list = [];
        var stack = 1;

            var childItems = function( obj, collection, callback ) {
                var children = obj.get(collection);

                if (children && children.Count > 0) {
                    stack = stack + children.Count;
                    obj.getCollection(collection).load({
                        fetch : true,
                        callback : function(records, operation, success) {
                            callback(records);
                        }
                    });
                }
            };

            var walk = function(root) {
                console.log(root.get("FormattedID"),stack);
                list.push(root); stack = stack - 1;

                _.each(["Children","UserStories","Tasks","Defects","TestCases"],function(collection){ 
                    childItems(root,collection, function(records){
                        _.each(records,function(record) {
                            walk(record);
                        })
                    });
                })
                console.log(root.get("FormattedID"),stack);
                if (stack==0) {
                    deferred.resolve(list);
                }
            }

            walk(obj);

            return deferred.promise;
    }

    };
});